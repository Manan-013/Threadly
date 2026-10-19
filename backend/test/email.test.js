process.env.THREADLY_DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const request = require('supertest');
const { app } = require('../src/server');
const { db } = require('../src/db');
const googleAuth = require('../src/googleAuth');
const { runDueMessages, recoverInterruptedDeliveries } = require('../src/services/delivery');
const { buildRawMime, isValidEmail } = require('../src/services/mailer');

const PASSWORD = 'correct-horse-battery-staple';
const bearer = token => ({ Authorization: `Bearer ${token}` });
const ACCOUNT = 'support@company.example';

let agent;
let sent; // calls captured by the stubbed Gmail transport
let transport; // current behaviour of the stub

test.before(async () => {
  const reg = await request(app).post('/api/auth/register').send({ name: 'Ana Agent', email: 'ana@company.example', password: PASSWORD });
  agent = reg.body;
  mock.method(googleAuth, 'sendGmailViaOAuth', async args => {
    sent.push(args);
    return transport(args);
  });
});

test.beforeEach(() => {
  sent = [];
  transport = async () => ({ id: 'gmail-msg-1', threadId: 'thread-1' });
  connectAccount(true);
});

function connectAccount(on) {
  db.prepare('DELETE FROM oauth_accounts').run();
  db.prepare("DELETE FROM workspace_settings WHERE key = 'google_oauth_connected_email'").run();
  if (on) {
    db.prepare("INSERT INTO oauth_accounts (provider, email, name, access_token, expires_at) VALUES ('google', ?, 'Support', 'x', 9999999999999)").run(ACCOUNT);
    db.prepare("INSERT INTO workspace_settings (key, value) VALUES ('google_oauth_connected_email', ?)").run(ACCOUNT);
  }
}

async function newConversation(customer = 'cora@customer.example') {
  const res = await request(app).post('/api/conversations').set(bearer(agent.token))
    .send({ subject: 'Where is my order?', customer_name: 'Cora', customer_email: customer, body: 'Hi' });
  return res.body;
}
const send = (conv, body) => request(app).post(`/api/conversations/${conv.id}/messages`).set(bearer(agent.token)).send({ body: 'We are on it.', ...body });
const msgRow = id => db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
const lastAgentMsg = convId => db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND is_agent_reply = 1 ORDER BY id DESC').get(convId);
const convRow = id => db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);

test('recipient must be the conversation customer; anything else is rejected before sending', async () => {
  const conv = await newConversation();
  const res = await send(conv, { recipient_email: 'attacker@evil.example' });
  assert.equal(res.status, 400);
  assert.equal(sent.length, 0);
  assert.equal(lastAgentMsg(conv.id), undefined, 'nothing was stored or sent');

  const same = await send(conv, { recipient_email: 'CORA@customer.example' });
  assert.equal(same.status, 200, 'the conversation address (any case) is fine');
  assert.equal(sent[0].to, 'cora@customer.example');
});

test('CR/LF and invalid addresses are rejected (header injection)', async () => {
  const conv = await newConversation();
  const attempts = [
    { recipient_email: 'cora@customer.example\r\nBcc: evil@evil.example' },
    { recipient_email: 'cora@customer.example\nBcc: evil@evil.example' },
    { cc_emails: 'a@b.example\r\nBcc: evil@evil.example' },
    { cc_emails: 'a@b.example,\nevil@evil.example' },
    { cc_emails: 'not-an-email' },
    { cc_emails: 'Name <a@b.example>' },
    { cc_emails: 'a@b.example, b@b.example, c@b.example, d@b.example, e@b.example, f@b.example' },
  ];
  for (const attempt of attempts) {
    const res = await send(conv, attempt);
    assert.equal(res.status, 400, JSON.stringify(attempt));
  }
  assert.equal(sent.length, 0);
  assert.equal(lastAgentMsg(conv.id), undefined);
});

test('the MIME builder neutralises CR/LF in subjects and display names and refuses bad addresses', async () => {
  const raw = (await buildRawMime({
    fromAddress: ACCOUNT,
    fromName: 'Evil\r\nBcc: victim@evil.example',
    to: 'cora@customer.example',
    subject: 'Order\r\nBcc: victim@evil.example',
    text: 'body',
  })).toString('utf8');
  const headerBlock = raw.split('\r\n\r\n')[0];
  assert.ok(!/^bcc:/im.test(headerBlock), `an injected Bcc header must not exist:\n${headerBlock}`);

  await assert.rejects(buildRawMime({ fromAddress: ACCOUNT, to: 'a@b.example\r\nBcc: x@y.example', subject: 's', text: 't' }), /not valid/);
  assert.equal(isValidEmail('a@b.example'), true);
  for (const bad of ['a@b', 'a b@c.example', 'a@b.example\n', '<a@b.example>', 'a@b.example,c@d.example', '']) {
    assert.equal(isValidEmail(bad), false, JSON.stringify(bad));
  }
});

test('the sender is the connected account and the sender name is the session user, never the request', async () => {
  const conv = await newConversation();
  const res = await send(conv, { sender_email: 'ceo@company.example', sender_name: 'CEO', from: 'ceo@company.example' });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].email, ACCOUNT);
  assert.equal(sent[0].fromName, 'Ana Agent');
  assert.equal(sent[0].to, 'cora@customer.example');
  const row = lastAgentMsg(conv.id);
  assert.equal(row.sender_email, ACCOUNT);
  assert.equal(row.sender_name, 'Ana Agent');
});

test('success: status becomes sent only after the provider accepts, and side effects are applied', async () => {
  const conv = await newConversation();
  let statusDuringSend;
  transport = async () => {
    statusDuringSend = lastAgentMsg(conv.id).status;
    return { id: 'abc123' };
  };
  const res = await send(conv, { close_on_send: true });
  assert.equal(res.status, 200);
  assert.equal(statusDuringSend, 'sending', 'not "sent" while the provider call is in flight');
  const row = lastAgentMsg(conv.id);
  assert.equal(row.status, 'sent');
  assert.equal(row.error, null);
  assert.equal(row.provider_message_id, 'abc123');
  assert.ok(row.sent_at);
  assert.ok(convRow(conv.id).first_responded_at);
  assert.equal(convRow(conv.id).status, 'Closed');
});

test('failure: status is failed, the error is stored and returned, and nothing is marked responded/closed', async () => {
  const conv = await newConversation();
  transport = async () => { throw new Error('Gmail API returned HTTP 403: quota exceeded'); };
  const res = await send(conv, { close_on_send: true });

  assert.equal(res.status, 502);
  assert.match(res.body.error, /quota exceeded/);
  assert.ok(res.body.message_id);
  assert.ok(res.body.conversation.messages.some(m => m.status === 'failed'));

  const row = msgRow(res.body.message_id);
  assert.equal(row.status, 'failed');
  assert.match(row.error, /quota exceeded/);
  assert.equal(row.sent_at, null);
  assert.equal(convRow(conv.id).first_responded_at, null);
  assert.notEqual(convRow(conv.id).status, 'Closed', 'Send & Close must not close when nothing was sent');
  const activity = db.prepare("SELECT description FROM activities WHERE conversation_id = ? AND activity_type = 'delivery_failed'").get(conv.id);
  assert.match(activity.description, /quota exceeded/);
});

test('failure: with no connected account the reply is saved as failed, not silently "sent"', async () => {
  connectAccount(false);
  const conv = await newConversation();
  const res = await send(conv);
  assert.equal(res.status, 502);
  assert.equal(sent.length, 0);
  const row = lastAgentMsg(conv.id);
  assert.equal(row.status, 'failed');
  assert.match(row.error, /No email account is connected/);
});

test('retry: a failed message can be re-sent once; sent messages cannot be retried', async () => {
  const conv = await newConversation();
  transport = async () => { throw new Error('temporary outage'); };
  const failed = await send(conv);
  assert.equal(failed.status, 502);
  const id = failed.body.message_id;

  transport = async () => ({ id: 'ok-2' });
  const retried = await request(app).post(`/api/messages/${id}/retry`).set(bearer(agent.token));
  assert.equal(retried.status, 200);
  assert.equal(msgRow(id).status, 'sent');
  assert.equal(msgRow(id).error, null);
  assert.equal(msgRow(id).attempts, 2);

  const again = await request(app).post(`/api/messages/${id}/retry`).set(bearer(agent.token));
  assert.equal(again.status, 409);
  assert.equal(sent.filter(s => s.to === 'cora@customer.example').length, 2, 'exactly one failed attempt + one successful retry');
});

test('scheduled sends: validated, held until due, sent exactly once by the worker', async () => {
  const conv = await newConversation();
  assert.equal((await send(conv, { scheduled_for: 'not a date' })).status, 400);
  assert.equal((await send(conv, { scheduled_for: new Date(Date.now() - 60000).toISOString() })).status, 400);

  const when = new Date(Date.now() + 3600e3).toISOString();
  const res = await send(conv, { scheduled_for: when, close_on_send: true });
  assert.equal(res.status, 200);
  const row = lastAgentMsg(conv.id);
  assert.equal(row.status, 'scheduled');
  assert.equal(sent.length, 0, 'nothing is sent at scheduling time');
  assert.equal(convRow(conv.id).first_responded_at, null);
  assert.notEqual(convRow(conv.id).status, 'Closed', 'closing waits for the actual send');

  assert.equal(await runDueMessages(), 0, 'not due yet');
  assert.equal(sent.length, 0);

  db.prepare('UPDATE messages SET scheduled_for = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), row.id);
  const [a, b] = await Promise.all([runDueMessages(), runDueMessages()]);
  assert.equal(a + b, 1, 'two workers racing still send once');
  assert.equal(sent.length, 1);
  assert.equal(msgRow(row.id).status, 'sent');
  assert.equal(convRow(conv.id).status, 'Closed');
  assert.ok(convRow(conv.id).first_responded_at);

  assert.equal(await runDueMessages(), 0);
  assert.equal(sent.length, 1, 'no duplicate on later runs');
});

test('scheduled send that fails is marked failed with the error and is not retried automatically', async () => {
  const conv = await newConversation();
  const res = await send(conv, { scheduled_for: new Date(Date.now() + 3600e3).toISOString() });
  assert.equal(res.status, 200);
  const row = lastAgentMsg(conv.id);
  db.prepare('UPDATE messages SET scheduled_for = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), row.id);
  transport = async () => { throw new Error('mailbox full'); };
  await runDueMessages();
  assert.equal(msgRow(row.id).status, 'failed');
  assert.match(msgRow(row.id).error, /mailbox full/);
  await runDueMessages();
  assert.equal(sent.length, 1);
});

test('external delivery (Gmail UI sends it) is recorded without the server sending a second copy', async () => {
  const conv = await newConversation();
  const res = await send(conv, { delivery: 'external' });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
  assert.equal(lastAgentMsg(conv.id).status, 'sent');
  assert.equal((await send(conv, { delivery: 'external', scheduled_for: new Date(Date.now() + 3600e3).toISOString() })).status, 400);
  assert.equal((await send(conv, { delivery: 'carrier-pigeon' })).status, 400);
});

test('messages left in "sending" by a crash are surfaced as failed on startup', () => {
  db.prepare("INSERT INTO conversations (conversation_code, subject, customer_name, customer_email, public_token) VALUES ('X-1', 's', 'n', 'n@n.example', 't')").run();
  const convId = db.prepare("SELECT id FROM conversations WHERE conversation_code = 'X-1'").get().id;
  const id = db.prepare("INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, status) VALUES (?, 'a', 'a@a.example', 'n@n.example', 'b', 1, 'sending')").run(convId).lastInsertRowid;
  assert.equal(recoverInterruptedDeliveries(), 1);
  assert.equal(msgRow(id).status, 'failed');
  assert.match(msgRow(id).error, /server stopped/);
});
