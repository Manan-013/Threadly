const { db, logActivity } = require('../db');
const googleAuth = require('../googleAuth'); // accessed as a module so tests can stub the transport
const { isValidEmail, parseCcList } = require('./mailer');

// Real Gmail thread ids are 12-20 hex chars; our own placeholders (ext_..., imap_..., gmail_...) are not.
const GMAIL_THREAD_ID = /^[0-9a-f]{12,20}$/i;
const MAX_ERROR_LENGTH = 500;

class DeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeliveryError';
  }
}

let notify = () => {};
/** Lets the HTTP layer broadcast conversation changes made by the background worker. */
function setNotifier(fn) {
  notify = typeof fn === 'function' ? fn : () => {};
}

function loadForDelivery(messageId) {
  return db.prepare(`
    SELECT m.*,
           c.customer_email, c.customer_name, c.subject AS conversation_subject, c.gmail_thread_id,
           i.email AS inbox_email
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN shared_inboxes i ON i.id = c.inbox_id
    WHERE m.id = ?
  `).get(messageId);
}

/** Side effects that only make sense once a reply has really gone out. */
function applySentEffects(message) {
  const actor = message.sender_name || 'Agent';
  db.prepare(`
    UPDATE conversations
    SET first_responded_at = COALESCE(first_responded_at, datetime('now')),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(message.conversation_id);

  if (message.is_private_split) {
    logActivity(message.conversation_id, actor, 'split_conversation', `${actor} replied privately via Split conversation.`);
  } else {
    logActivity(message.conversation_id, actor, 'replied', `${actor} replied to ${message.customer_name || 'the customer'}.`);
  }

  if (message.close_on_send) {
    db.prepare(`UPDATE conversations SET status = 'Closed', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(message.conversation_id);
    logActivity(message.conversation_id, actor, 'status_changed', `${actor} closed conversation via Send & Close.`);
  }
}

/**
 * Sends one message that has already been claimed (status = 'sending').
 * The row ends as 'sent' only after the provider accepted it; any failure is stored on the row,
 * logged, recorded in the activity feed and returned to the caller. Nothing is swallowed.
 */
async function deliverMessage(messageId) {
  const row = loadForDelivery(messageId);
  if (!row) throw new Error(`Message ${messageId} does not exist`);
  if (row.status !== 'sending') throw new Error(`Message ${messageId} is "${row.status}" and cannot be delivered`);

  try {
    // The sender is the connected mailbox; the recipient is whoever the conversation is with.
    const account = googleAuth.getConnectedAccount();
    if (!account || !account.email) {
      throw new DeliveryError('No email account is connected. An Admin must connect Gmail (Admin > Connectors) before replies can be delivered.');
    }
    if (!isValidEmail(row.customer_email)) {
      throw new DeliveryError(`"${String(row.customer_email).slice(0, 80)}" is not a valid recipient address for this conversation.`);
    }
    const cc = parseCcList(row.cc_emails);
    const replyTo = row.inbox_email && isValidEmail(row.inbox_email) && row.inbox_email.toLowerCase() !== account.email.toLowerCase()
      ? row.inbox_email
      : undefined;

    const result = await googleAuth.sendGmailViaOAuth({
      email: account.email,
      fromName: row.sender_name,
      to: row.customer_email,
      cc,
      replyTo,
      subject: row.conversation_subject,
      body: row.body,
      threadId: GMAIL_THREAD_ID.test(row.gmail_thread_id || '') ? row.gmail_thread_id : undefined,
    });

    db.prepare(`
      UPDATE messages
      SET status = 'sent', error = NULL, sent_at = datetime('now'),
          sender_email = ?, recipient_email = ?, provider_message_id = ?
      WHERE id = ? AND status = 'sending'
    `).run(account.email, row.customer_email, result && result.id ? String(result.id) : null, messageId);
    applySentEffects(row);
    notify(row.conversation_id);
    return { ok: true };
  } catch (err) {
    const message = String((err && err.message) || err).slice(0, MAX_ERROR_LENGTH);
    db.prepare("UPDATE messages SET status = 'failed', error = ? WHERE id = ? AND status = 'sending'").run(message, messageId);
    logActivity(row.conversation_id, 'System', 'delivery_failed', `Failed to deliver email: ${message}`, { messageId });
    console.error(JSON.stringify({ level: 'error', msg: 'email delivery failed', messageId, conversationId: row.conversation_id, error: message }));
    notify(row.conversation_id);
    return { ok: false, error: message };
  }
}

/** Atomically moves a failed message back to 'sending'. Returns false if someone else already did. */
function claimForRetry(messageId) {
  const res = db.prepare("UPDATE messages SET status = 'sending', error = NULL, attempts = attempts + 1 WHERE id = ? AND status = 'failed'").run(messageId);
  return Number(res.changes) === 1;
}

/** Sends every scheduled message whose time has come. Safe to call concurrently: each row is claimed once. */
async function runDueMessages({ limit = 20 } = {}) {
  const due = db.prepare(`
    SELECT id FROM messages
    WHERE status = 'scheduled' AND datetime(scheduled_for) <= datetime('now')
    ORDER BY datetime(scheduled_for) ASC, id ASC
    LIMIT ?
  `).all(limit);

  let processed = 0;
  for (const { id } of due) {
    const claimed = db.prepare("UPDATE messages SET status = 'sending', attempts = attempts + 1 WHERE id = ? AND status = 'scheduled'").run(id);
    if (Number(claimed.changes) !== 1) continue;
    await deliverMessage(id);
    processed++;
  }
  return processed;
}

/** A crash mid-send leaves rows in 'sending'. We cannot know whether Gmail accepted them, so flag them. */
function recoverInterruptedDeliveries() {
  const res = db.prepare(`
    UPDATE messages
    SET status = 'failed',
        error = 'The server stopped while this message was being sent. Check the Gmail Sent folder before retrying to avoid a duplicate.'
    WHERE status = 'sending'
  `).run();
  return Number(res.changes);
}

function startScheduler({ intervalMs = 30000 } = {}) {
  const timer = setInterval(() => {
    runDueMessages().catch(err => {
      console.error(JSON.stringify({ level: 'error', msg: 'scheduled send run failed', error: String((err && err.message) || err) }));
    });
  }, intervalMs);
  timer.unref();
  return timer;
}

module.exports = {
  DeliveryError,
  setNotifier,
  deliverMessage,
  applySentEffects,
  claimForRetry,
  runDueMessages,
  recoverInterruptedDeliveries,
  startScheduler,
};
