process.env.THREADLY_DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../src/server');
const { db } = require('../src/db');

const legacyHash = pw => crypto.createHash('sha256').update(pw + 'threadly_salt_2026').digest('hex');

test('register then login with the correct password works', async () => {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Ada', email: 'ada@example.com', password: 'a-long-passphrase' });
  assert.equal(reg.status, 201);
  const stored = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('ada@example.com').password_hash;
  assert.match(stored, /^scrypt\$/);

  const login = await request(app).post('/api/auth/login')
    .send({ email: 'ada@example.com', password: 'a-long-passphrase' });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
});

test('login without a password is rejected (previously logged in as anyone)', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'ada@example.com' });
  assert.equal(res.status, 400);
  assert.equal(res.body.token, undefined);
  const res2 = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: '' });
  assert.equal(res2.status, 400);
});

test('wrong password and unknown email give the same 401', async () => {
  const wrong = await request(app).post('/api/auth/login')
    .send({ email: 'ada@example.com', password: 'not-the-password' });
  const unknown = await request(app).post('/api/auth/login')
    .send({ email: 'nobody@example.com', password: 'not-the-password' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
});

test('an account with an empty password hash can never log in', async () => {
  db.prepare("INSERT INTO users (name, email, role, password_hash) VALUES ('Seeded', 'seeded@example.com', 'Admin', '')").run();
  for (const password of ['', 'anything-at-all', 'x']) {
    const res = await request(app).post('/api/auth/login').send({ email: 'seeded@example.com', password });
    assert.notEqual(res.status, 200, `password=${JSON.stringify(password)}`);
    assert.equal(res.body.token, undefined);
  }
});

test('legacy SHA-256 hash is accepted once and transparently upgraded to scrypt', async () => {
  const legacy = legacyHash('legacy-password-1');
  db.prepare("INSERT INTO users (name, email, role, password_hash) VALUES ('Legacy', 'legacy@example.com', 'Agent', ?)").run(legacy);

  const bad = await request(app).post('/api/auth/login')
    .send({ email: 'legacy@example.com', password: 'legacy-password-2' });
  assert.equal(bad.status, 401);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE email = ?').get('legacy@example.com').password_hash, legacy,
    'a failed login must not touch the stored hash');

  const ok = await request(app).post('/api/auth/login')
    .send({ email: 'legacy@example.com', password: 'legacy-password-1' });
  assert.equal(ok.status, 200);
  const upgraded = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('legacy@example.com').password_hash;
  assert.match(upgraded, /^scrypt\$/);

  const again = await request(app).post('/api/auth/login')
    .send({ email: 'legacy@example.com', password: 'legacy-password-1' });
  assert.equal(again.status, 200, 'upgraded hash must still verify');
});

test('registering with a short password is rejected', async () => {
  const res = await request(app).post('/api/auth/register')
    .send({ name: 'Short', email: 'short@example.com', password: 'short' });
  assert.equal(res.status, 400);
});
