process.env.THREADLY_DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/server');
const { db, generateConversationCode } = require('../src/db');

const PASSWORD = 'correct-horse-battery-staple';
const bearer = token => ({ Authorization: `Bearer ${token}` });

const SECRETS = {
  internalNote: 'INTERNAL-NOTE-do-not-leak',
  privateReply: 'PRIVATE-SPLIT-do-not-leak',
  assigneeEmail: 'agent.private@example.com',
  customerEmail: 'customer.private@example.com',
  tagName: 'TAG-INTERNAL-do-not-leak',
};

let admin;
let conv;

test.before(async () => {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Admin Person', email: SECRETS.assigneeEmail, password: PASSWORD });
  admin = reg.body;
  const created = await request(app).post('/api/conversations').set(bearer(admin.token))
    .send({ subject: 'Refund please', customer_name: 'Cora Customer', customer_email: SECRETS.customerEmail, body: 'Hello, I need help.' });
  conv = created.body;
  await request(app).post(`/api/conversations/${conv.id}/notes`).set(bearer(admin.token)).send({ body: SECRETS.internalNote });
  await request(app).post(`/api/conversations/${conv.id}/tags`).set(bearer(admin.token)).send({ tag_name: SECRETS.tagName });
  await request(app).patch(`/api/conversations/${conv.id}`).set(bearer(admin.token)).send({ assignee_id: admin.user.id });
  db.prepare(`INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, cc_emails, body, is_agent_reply, is_private_split, status)
              VALUES (?, 'Admin Person', ?, ?, 'cc.private@example.com', ?, 1, 1, 'sent')`)
    .run(conv.id, SECRETS.assigneeEmail, SECRETS.customerEmail, SECRETS.privateReply);
  db.prepare(`INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, status)
              VALUES (?, 'Admin Person', ?, ?, 'Public reply to the customer', 1, 'sent')`)
    .run(conv.id, SECRETS.assigneeEmail, SECRETS.customerEmail);
  db.prepare(`INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, status)
              VALUES (?, 'Admin Person', ?, ?, 'Scheduled, not yet sent', 1, 'scheduled')`)
    .run(conv.id, SECRETS.assigneeEmail, SECRETS.customerEmail);
});

const tokenOf = id => db.prepare('SELECT public_token FROM conversations WHERE id = ?').get(id).public_token;
const enable = on => request(app).patch(`/api/conversations/${conv.id}`).set(bearer(admin.token)).send({ public_link_enabled: on });

test('a link that is not enabled returns 404 even with the correct token', async () => {
  const res = await request(app).get(`/api/shared/${tokenOf(conv.id)}`);
  assert.equal(res.status, 404);
});

test('conversation code and numeric id never resolve, even when the link is enabled', async () => {
  await enable(true);
  assert.equal((await request(app).get(`/api/shared/${conv.conversation_code}`)).status, 404);
  assert.equal((await request(app).get(`/api/shared/${conv.id}`)).status, 404);
  assert.equal((await request(app).get(`/api/shared/${'a'.repeat(300)}`)).status, 404);
  assert.equal((await request(app).get('/api/shared/%25%25')).status, 404);
});

test('the public view is redacted: only allowlisted fields, no notes, activity, assignee, tags or emails', async () => {
  await enable(true);
  const res = await request(app).get(`/api/shared/${tokenOf(conv.id)}`); // note: no Authorization header
  assert.equal(res.status, 200);

  assert.deepEqual(Object.keys(res.body).sort(),
    ['conversation_code', 'created_at', 'customer_name', 'messages', 'status', 'subject', 'updated_at']);
  for (const m of res.body.messages) {
    assert.deepEqual(Object.keys(m).sort(), ['body', 'created_at', 'id', 'is_agent_reply', 'sender_name']);
  }

  const raw = JSON.stringify(res.body);
  for (const [name, secret] of Object.entries(SECRETS)) {
    assert.ok(!raw.includes(secret), `${name} leaked through the public link`);
  }
  assert.ok(!raw.includes('cc.private@example.com'));
  assert.ok(!raw.includes(tokenOf(conv.id)), 'the token itself is not echoed back');

  const bodies = res.body.messages.map(m => m.body);
  assert.ok(bodies.includes('Public reply to the customer'));
  assert.ok(!bodies.includes(SECRETS.privateReply), 'private split replies are hidden');
  assert.ok(!bodies.includes('Scheduled, not yet sent'), 'unsent (scheduled) messages are hidden');
  assert.equal(res.body.customer_name, 'Cora Customer');
});

test('the public response is not cacheable or indexable', async () => {
  const res = await request(app).get(`/api/shared/${tokenOf(conv.id)}`);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.headers['x-robots-tag'], /noindex/);
});

test('disabling a link rotates its token: the old URL stays dead after re-enabling', async () => {
  await enable(true);
  const oldToken = tokenOf(conv.id);
  assert.equal((await request(app).get(`/api/shared/${oldToken}`)).status, 200);

  await enable(false);
  assert.equal((await request(app).get(`/api/shared/${oldToken}`)).status, 404);

  await enable(true);
  assert.equal((await request(app).get(`/api/shared/${oldToken}`)).status, 404, 'old token must not revive');
  assert.equal((await request(app).get(`/api/shared/${tokenOf(conv.id)}`)).status, 200);
});

test('new public tokens are 192-bit base64url; legacy hex tokens keep working', async () => {
  assert.match(tokenOf(conv.id), /^[A-Za-z0-9_-]{32}$/);

  const legacy = 'ab'.repeat(24); // 48 hex chars, as generated before this change
  db.prepare('UPDATE conversations SET public_token = ?, public_link_enabled = 1 WHERE id = ?').run(legacy, conv.id);
  assert.equal((await request(app).get(`/api/shared/${legacy}`)).status, 200);
});

test('conversation codes are collision-free, including after rows are deleted', () => {
  const seen = new Set();
  const numbers = [];
  for (let i = 0; i < 2000; i++) {
    const code = generateConversationCode();
    assert.ok(!seen.has(code), `duplicate code ${code}`);
    seen.add(code);
    numbers.push(Number(code.split('-')[0]));
  }
  for (let i = 1; i < numbers.length; i++) assert.ok(numbers[i] === numbers[i - 1] + 1);

  // Deleting the newest conversation must not let its number be handed out again.
  const before = db.prepare('SELECT MAX(id) AS m FROM conversations').get().m;
  db.prepare('DELETE FROM conversations WHERE id = ?').run(before);
  const next = Number(generateConversationCode().split('-')[0]);
  assert.ok(next > numbers.at(-1), 'counter never moves backwards');
});
