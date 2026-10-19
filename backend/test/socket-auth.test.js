process.env.THREADLY_DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const { app, server, io } = require('../src/server');
const { db } = require('../src/db');

const PASSWORD = 'correct-horse-battery-staple';
let baseUrl;
let token;
let conversationId;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const reg = await request(app).post('/api/auth/register').send({ name: 'Sock Et', email: 'sock@example.com', password: PASSWORD });
  token = reg.body.token;
  const conv = await request(app).post('/api/conversations').set('Authorization', `Bearer ${token}`)
    .send({ subject: 'Realtime', customer_email: 'c@example.com' });
  conversationId = conv.body.id;
});

test.after(async () => {
  io.close();
  await new Promise(resolve => server.close(resolve));
});

const open = auth => connect(baseUrl, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
const outcome = socket => new Promise(resolve => {
  socket.on('connect', () => resolve('connected'));
  socket.on('connect_error', err => resolve(`error:${err.message}`));
});

test('socket without a token is rejected at the handshake', async () => {
  const s = open({});
  assert.equal(await outcome(s), 'error:Authentication failed');
  s.close();
});

test('socket with a forged token is rejected at the handshake', async () => {
  const s = open({ token: 'x'.repeat(43) });
  assert.equal(await outcome(s), 'error:Authentication failed');
  s.close();
});

test('socket with a valid session token connects', async () => {
  const s = open({ token });
  assert.equal(await outcome(s), 'connected');
  s.close();
});

test('presence and shared-draft identity come from the session, not the client', async () => {
  const s = open({ token });
  assert.equal(await outcome(s), 'connected');

  const presence = new Promise(resolve => s.on('presence_updated', resolve));
  s.emit('join_conversation', { conversationId, userName: 'CEO', userEmail: 'ceo@example.com' });
  const update = await presence;
  assert.equal(update.presence[0].userName, 'Sock Et');
  assert.equal(update.presence[0].userEmail, 'sock@example.com');

  s.emit('shared_draft_change', { conversationId, toEmail: 'c@example.com', body: 'draft', updatedByName: 'CEO' });
  await new Promise(r => setTimeout(r, 100));
  const draft = db.prepare('SELECT updated_by_name FROM shared_drafts WHERE conversation_id = ?').get(conversationId);
  assert.equal(draft.updated_by_name, 'Sock Et');
  s.close();
});

test('joining a conversation that does not exist is ignored', async () => {
  const s = open({ token });
  assert.equal(await outcome(s), 'connected');
  let got = false;
  s.on('presence_updated', () => { got = true; });
  s.emit('join_conversation', { conversationId: 99999 });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(got, false);
  s.close();
});
