process.env.THREADLY_DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { db } = require('../src/db');
const googleAuth = require('../src/googleAuth');

const ACCOUNT = 'support@company.example';

function connect() {
  db.prepare("INSERT OR REPLACE INTO oauth_accounts (provider, email, name, access_token, expires_at) VALUES ('google', ?, 'Support', 'plain-access-token', 9999999999999)").run(ACCOUNT);
}

test('sendGmailViaOAuth posts a safely built RFC 5322 message to the Gmail API', async () => {
  connect();
  const calls = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 'm-1', threadId: 'abcdef0123456789' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  try {
    const result = await googleAuth.sendGmailViaOAuth({
      email: ACCOUNT,
      fromName: 'Ana Agent',
      to: 'cora@customer.example',
      cc: ['boss@company.example'],
      replyTo: 'inbox@company.example',
      subject: 'Where is my order?\r\nBcc: victim@evil.example',
      body: 'Hello Cora',
      threadId: 'abcdef0123456789',
    });
    assert.equal(result.id, 'm-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer plain-access-token');

    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.threadId, 'abcdef0123456789');
    const mime = Buffer.from(payload.raw, 'base64url').toString('utf8');
    const headers = mime.split('\r\n\r\n')[0];
    assert.match(headers, /^From: "?Ana Agent"? <support@company\.example>$/m);
    assert.match(headers, /^To: cora@customer\.example$/m);
    assert.match(headers, /^Cc: boss@company\.example$/m);
    assert.match(headers, /^Reply-To: inbox@company\.example$/m);
    assert.match(headers, /^Subject: Re: Where is my order\? Bcc: victim@evil\.example$/m);
    assert.ok(!/^bcc:/im.test(headers));
    assert.equal(mime.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim(), 'Hello Cora');
  } finally {
    mock.restoreAll();
  }
});

test('sendGmailViaOAuth surfaces Gmail API errors instead of swallowing them', async () => {
  connect();
  mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ error: { message: 'Daily user sending limit exceeded' } }), { status: 429 }));
  try {
    await assert.rejects(
      googleAuth.sendGmailViaOAuth({ email: ACCOUNT, to: 'cora@customer.example', subject: 's', body: 'b' }),
      /Daily user sending limit exceeded/);
  } finally {
    mock.restoreAll();
  }
});

test('sendGmailViaOAuth refuses an invalid recipient before any network call', async () => {
  connect();
  const spy = mock.method(globalThis, 'fetch', async () => new Response('{}'));
  try {
    await assert.rejects(
      googleAuth.sendGmailViaOAuth({ email: ACCOUNT, to: 'cora@customer.example\r\nBcc: x@y.example', subject: 's', body: 'b' }),
      /not valid/);
    assert.equal(spy.mock.callCount(), 0);
  } finally {
    mock.restoreAll();
  }
});

test('upgrade: messages that an older version left as "scheduled" are surfaced as failed, never auto-sent', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'threadly-legacy-')), 'old.sqlite');
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_code TEXT NOT NULL UNIQUE, subject TEXT NOT NULL,
      customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, public_token TEXT NOT NULL);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL, sender_name TEXT NOT NULL,
      sender_email TEXT NOT NULL, recipient_email TEXT NOT NULL, cc_emails TEXT DEFAULT '', body TEXT NOT NULL,
      is_agent_reply INTEGER NOT NULL DEFAULT 0, is_private_split INTEGER NOT NULL DEFAULT 0, scheduled_for TEXT,
      status TEXT NOT NULL DEFAULT 'sent', created_at TEXT DEFAULT (datetime('now')));
    INSERT INTO conversations (conversation_code, subject, customer_name, customer_email, public_token) VALUES ('0001-AAAA', 's', 'c', 'c@c.example', 't');
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, scheduled_for, status)
      VALUES (1, 'a', 'a@a.example', 'c@c.example', 'old draft', 1, '2025-01-01T09:00:00.000Z', 'scheduled');
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, status)
      VALUES (1, 'a', 'a@a.example', 'c@c.example', 'normal sent message', 1, 'sent');
  `);
  old.close();

  const run = spawnSync(process.execPath, ['-e', `
    const { db } = require('./src/db');
    console.log(JSON.stringify(db.prepare('SELECT body, status, error FROM messages ORDER BY id').all()));
  `], { cwd: path.join(__dirname, '..'), env: { ...process.env, THREADLY_DB_PATH: file }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const rows = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.equal(rows[0].status, 'failed');
  assert.match(rows[0].error, /never sent by an earlier version/);
  assert.equal(rows[1].status, 'sent');
  assert.equal(rows[1].error, null);
});
