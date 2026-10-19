const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const { db, generateConversationCode, generateToken, logActivity } = require('./db');
const { applySlaPolicies, evaluateAutomations, runAutoAssignment, analyzeSentiment } = require('./engine');

function getSavedGmailCredentials(email = '') {
  if (!email) {
    const defaultEmailRow = db.prepare("SELECT value FROM workspace_settings WHERE key = 'gmail_sync_email'").get();
    const defaultPassRow = db.prepare("SELECT value FROM workspace_settings WHERE key = 'gmail_sync_password'").get();
    if (defaultEmailRow?.value && defaultPassRow?.value) {
      return { email: defaultEmailRow.value, appPassword: defaultPassRow.value };
    }
    return null;
  }
  const key = `gmail_app_password_${email.toLowerCase()}`;
  const row = db.prepare('SELECT value FROM workspace_settings WHERE key = ?').get(key);
  if (row && row.value) return { email, appPassword: row.value };

  return null;
}

function saveGmailCredentials(email, appPassword) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = appPassword.replace(/\s+/g, '');
  const stmt = db.prepare(`
    INSERT INTO workspace_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  stmt.run('gmail_sync_email', cleanEmail);
  stmt.run('gmail_sync_password', cleanPass);
  stmt.run(`gmail_app_password_${cleanEmail}`, cleanPass);
}

function upsertEmailIntoThreadly({
  externalId,
  inboxId,
  subject,
  fromName,
  fromEmail,
  toEmail,
  body,
  dateIso,
  isSentByMe,
}) {
  const cleanSubject = (subject || '(No Subject)').replace(/^(Re|Fwd):\s*/i, '').trim() || '(No Subject)';
  const existingByExt = externalId
    ? db.prepare('SELECT * FROM conversations WHERE gmail_thread_id = ?').get(externalId)
    : null;
  const existingBySubj = !existingByExt
    ? db.prepare('SELECT * FROM conversations WHERE LOWER(subject) = LOWER(?) AND inbox_id = ?').get(cleanSubject, inboxId)
    : null;

  const targetConv = existingByExt || existingBySubj;
  const createdAt = dateIso || new Date().toISOString();

  if (targetConv) {
    // Check if identical message already exists
    const dup = db.prepare(`
      SELECT id FROM messages WHERE conversation_id = ? AND sender_email = ? AND substr(body, 1, 120) = substr(?, 1, 120)
    `).get(targetConv.id, fromEmail, body || cleanSubject);

    if (!dup) {
      db.prepare(`
        INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetConv.id,
        fromName || fromEmail,
        fromEmail,
        toEmail,
        body || cleanSubject,
        isSentByMe ? 1 : 0,
        createdAt
      );
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(createdAt, targetConv.id);
    }
    return targetConv.id;
  }

  // Create new conversation
  const customerEmail = isSentByMe ? toEmail : fromEmail;
  const customerName = isSentByMe ? (toEmail.split('@')[0] || 'Recipient') : (fromName || fromEmail.split('@')[0]);
  const code = generateConversationCode();
  const token = generateToken();
  const sentiment = analyzeSentiment(`${cleanSubject} ${body}`);

  const info = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, priority, public_token, sentiment, created_at, updated_at
    ) VALUES (?, ?, ?, 'email', ?, ?, ?, 'Open', '--', ?, ?, ?, ?)
  `).run(
    code,
    externalId || `gmail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    inboxId,
    cleanSubject,
    customerName,
    customerEmail,
    token,
    sentiment,
    createdAt,
    createdAt
  );

  const convId = info.lastInsertRowid;

  db.prepare(`
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    convId,
    fromName || fromEmail,
    fromEmail,
    toEmail,
    body || cleanSubject,
    isSentByMe ? 1 : 0,
    createdAt
  );

  logActivity(
    convId,
    isSentByMe ? fromName || fromEmail : 'Gmail Sync',
    isSentByMe ? 'replied' : 'created',
    isSentByMe
      ? `Synced sent email to ${toEmail} from Gmail.`
      : `Synced incoming email from ${fromEmail} via Gmail.`
  );

  evaluateAutomations(convId, body || cleanSubject);
  runAutoAssignment(convId);
  applySlaPolicies(convId);

  return convId;
}

async function syncGmailImap({ email, appPassword, maxMessages = 25 }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = appPassword.replace(/\s+/g, '');

  let inboxRow = db.prepare('SELECT * FROM shared_inboxes WHERE LOWER(email) = LOWER(?)').get(cleanEmail);
  if (!inboxRow) {
    inboxRow = db.prepare('SELECT * FROM shared_inboxes ORDER BY id ASC LIMIT 1').get();
  }
  const inboxId = inboxRow ? inboxRow.id : null;

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: cleanEmail, pass: cleanPass },
    logger: false,
  });
  client.on('error', () => {});

  await client.connect();
  let syncedReceived = 0;
  let syncedSent = 0;

  try {
    // 1. Sync INBOX (Received emails)
    const lockInbox = await client.getMailboxLock('INBOX');
    try {
      const total = client.mailbox.exists || 0;
      if (total > 0) {
        const startSeq = Math.max(1, total - maxMessages + 1);
        for await (const msg of client.fetch(`${startSeq}:*`, { source: true, uid: true, envelope: true })) {
          const parsed = await simpleParser(msg.source);
          const fromObj = parsed.from?.value?.[0] || {};
          const toObj = parsed.to?.value?.[0] || {};
          const fromAddr = (fromObj.address || 'unknown@gmail.com').toLowerCase();
          const fromName = fromObj.name || fromAddr.split('@')[0];
          const toAddr = (toObj.address || cleanEmail).toLowerCase();
          const textBody = (parsed.text || parsed.subject || '').trim().slice(0, 4000);
          const isSent = fromAddr === cleanEmail;

          upsertEmailIntoThreadly({
            externalId: `imap_uid_${cleanEmail}_inbox_${msg.uid}`,
            inboxId,
            subject: parsed.subject || '(No Subject)',
            fromName,
            fromEmail: fromAddr,
            toEmail: toAddr,
            body: textBody,
            dateIso: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
            isSentByMe: isSent,
          });
          syncedReceived++;
        }
      }
    } finally {
      lockInbox.release();
    }

    // 2. Sync [Gmail]/Sent Mail (Sent emails)
    const mailboxes = await client.list();
    const sentBox =
      mailboxes.find(b => b.specialUse === '\\Sent') ||
      mailboxes.find(b => b.path.toLowerCase().includes('sent'));

    if (sentBox) {
      const lockSent = await client.getMailboxLock(sentBox.path);
      try {
        const totalSent = client.mailbox.exists || 0;
        if (totalSent > 0) {
          const startSeq = Math.max(1, totalSent - maxMessages + 1);
          for await (const msg of client.fetch(`${startSeq}:*`, { source: true, uid: true, envelope: true })) {
            const parsed = await simpleParser(msg.source);
            const fromObj = parsed.from?.value?.[0] || {};
            const toObj = parsed.to?.value?.[0] || {};
            const fromAddr = (fromObj.address || cleanEmail).toLowerCase();
            const fromName = fromObj.name || 'Manan Ramani';
            const toAddr = (toObj.address || 'recipient@gmail.com').toLowerCase();
            const textBody = (parsed.text || parsed.subject || '').trim().slice(0, 4000);

            upsertEmailIntoThreadly({
              externalId: `imap_uid_${cleanEmail}_sent_${msg.uid}`,
              inboxId,
              subject: parsed.subject || '(No Subject)',
              fromName,
              fromEmail: fromAddr,
              toEmail: toAddr,
              body: textBody,
              dateIso: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
              isSentByMe: true,
            });
            syncedSent++;
          }
        }
      } finally {
        lockSent.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  saveGmailCredentials(cleanEmail, cleanPass);
  return {
    ok: true,
    email: cleanEmail,
    syncedCount: syncedReceived + syncedSent,
    receivedCount: syncedReceived,
    sentCount: syncedSent,
    syncedReceived,
    syncedSent,
  };
}

async function sendGmailSmtp({ fromEmail, toEmail, subject, body, cc, ccEmails }) {
  const creds = getSavedGmailCredentials(fromEmail);
  if (!creds || !creds.appPassword) {
    return { sentViaSmtp: false, reason: 'No Gmail App Password configured' };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: creds.email,
      pass: creds.appPassword,
    },
  });

  await transporter.sendMail({
    from: `"Manan Ramani (Threadly)" <${creds.email}>`,
    to: toEmail,
    cc: cc || ccEmails || undefined,
    subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
    text: body,
  });

  return { sentViaSmtp: true, from: creds.email };
}

function bulkSyncFromExtension({ ownerEmail = 'admin@threadly.io', items = [] }) {
  let inboxRow = db.prepare('SELECT * FROM shared_inboxes WHERE LOWER(email) = LOWER(?)').get(ownerEmail.toLowerCase());
  if (!inboxRow) {
    inboxRow = db.prepare('SELECT * FROM shared_inboxes ORDER BY id ASC LIMIT 1').get();
  }
  const inboxId = inboxRow ? inboxRow.id : null;

  let count = 0;
  for (const item of items) {
    if (!item.subject) continue;
    const sEmail = item.sender_email || item.senderEmail || '';
    const sName = item.sender_name || item.senderName || 'Sender';
    const rEmail = item.recipient_email || item.recipientEmail || '';
    const isSent =
      Boolean(item.is_sent) ||
      item.folder === 'sent' ||
      (sEmail && sEmail.toLowerCase() === ownerEmail.toLowerCase());

    upsertEmailIntoThreadly({
      externalId:
        item.gmail_thread_id ||
        item.threadKey ||
        `ext_${item.subject.slice(0, 40)}_${sEmail}`,
      inboxId,
      subject: item.subject,
      fromName: isSent ? (item.sender_name || 'Agent') : sName,
      fromEmail: isSent ? ownerEmail : sEmail || 'sender@example.com',
      toEmail: isSent ? rEmail || item.customer_email || 'recipient@example.com' : ownerEmail,
      body: item.body || item.snippet || item.subject,
      dateIso: new Date().toISOString(),
      isSentByMe: isSent,
    });
    count++;
  }
  return { ok: true, syncedCount: count };
}

module.exports = {
  getSavedGmailCredentials,
  saveGmailCredentials,
  upsertEmailIntoThreadly,
  syncGmailImap,
  sendGmailSmtp,
  bulkSyncFromExtension,
};
