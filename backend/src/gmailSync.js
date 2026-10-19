const { db, generateConversationCode, generateToken, logActivity } = require('./db');
const { applySlaPolicies, evaluateAutomations, runAutoAssignment, analyzeSentiment } = require('./engine');
const { isValidEmail } = require('./services/mailer');

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

function bulkSyncFromExtension({ ownerEmail, items = [] }) {
  const owner = String(ownerEmail || '').toLowerCase();
  let inboxRow = owner ? db.prepare('SELECT * FROM shared_inboxes WHERE LOWER(email) = ?').get(owner) : null;
  if (!inboxRow) {
    inboxRow = db.prepare('SELECT * FROM shared_inboxes ORDER BY id ASC LIMIT 1').get();
  }
  const inboxId = inboxRow ? inboxRow.id : null;

  let count = 0;
  let skipped = 0;
  for (const item of items) {
    if (!item || typeof item.subject !== 'string' || !item.subject.trim()) continue;
    const sEmail = String(item.sender_email || item.senderEmail || '').trim().toLowerCase();
    const sName = String(item.sender_name || item.senderName || '').trim() || 'Sender';
    const rEmail = String(item.recipient_email || item.recipientEmail || item.customer_email || '').trim().toLowerCase();
    const isSent =
      Boolean(item.is_sent) ||
      item.folder === 'sent' ||
      (sEmail && sEmail === owner);

    // The other party must be a real address: never invent one, because agents can reply to it.
    const counterparty = isSent ? rEmail : sEmail;
    if (!isValidEmail(counterparty)) {
      skipped++;
      continue;
    }

    upsertEmailIntoThreadly({
      externalId:
        item.gmail_thread_id ||
        item.threadKey ||
        `ext_${item.subject.slice(0, 40)}_${counterparty}`,
      inboxId,
      subject: item.subject.slice(0, 300),
      fromName: isSent ? (String(item.sender_name || '').trim() || 'Agent') : sName,
      fromEmail: isSent ? owner : sEmail,
      toEmail: isSent ? rEmail : owner,
      body: String(item.body || item.snippet || item.subject).slice(0, 4000),
      dateIso: new Date().toISOString(),
      isSentByMe: isSent,
    });
    count++;
  }
  return { ok: true, syncedCount: count, skippedCount: skipped };
}

module.exports = {
  upsertEmailIntoThreadly,
  bulkSyncFromExtension,
};
