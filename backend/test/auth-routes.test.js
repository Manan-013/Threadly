process.env.THREADLY_DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/server');
const { db } = require('../src/db');
const { hashToken } = require('../src/services/sessions');
const { isPublicRoute } = require('../src/middleware/auth');

const PASSWORD = 'correct-horse-battery-staple';
const bearer = token => ({ Authorization: `Bearer ${token}` });

async function signUp(name, email, extra = {}) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}
const logIn = async email =>
  (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body;

/** Every route registered on the Express app under /api, as { method, path }. */
function listApiRoutes() {
  const routes = [];
  for (const layer of app._router.stack) {
    if (!layer.route || typeof layer.route.path !== 'string' || !layer.route.path.startsWith('/api')) continue;
    for (const method of Object.keys(layer.route.methods)) {
      routes.push({ method: method.toUpperCase(), path: layer.route.path });
    }
  }
  return routes;
}
const concrete = p => p.replace(/:[A-Za-z]+/g, '1');
const isPublic = r => isPublicRoute({ method: r.method, path: concrete(r.path).slice('/api'.length) });

test('route inventory is non-trivial (guards the table-driven tests below)', () => {
  const routes = listApiRoutes();
  assert.ok(routes.length >= 60, `expected at least 60 routes, found ${routes.length}`);
  const publicOnes = routes.filter(isPublic).map(r => `${r.method} ${r.path}`).sort();
  assert.deepEqual(publicOnes, [
    'GET /api/auth/google/callback',
    'GET /api/health',
    'GET /api/shared/:codeOrToken',
    'POST /api/auth/login',
    'POST /api/auth/register',
  ]);
});

test('with NO users in the database, protected routes still return 401 (no first-run bypass)', async () => {
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 0);
  const res = await request(app).get('/api/conversations');
  assert.equal(res.status, 401);
  const res2 = await request(app).post('/api/inboxes').send({ name: 'x', email: 'x@example.com' });
  assert.equal(res2.status, 401);
});

test('every non-public route returns 401 without a session, with a bogus token, or with a spoofed x-user-id', async () => {
  await signUp('Root Admin', 'root@example.com');
  const protectedRoutes = listApiRoutes().filter(r => !isPublic(r));
  assert.ok(protectedRoutes.length >= 55);

  for (const r of protectedRoutes) {
    const url = concrete(r.path);
    const label = `${r.method} ${r.path}`;
    const call = () => request(app)[r.method.toLowerCase()](url);
    const withBody = req => (['POST', 'PATCH', 'PUT'].includes(r.method) ? req.send({}) : req);

    assert.equal((await withBody(call())).status, 401, `${label} without a session`);
    assert.equal((await withBody(call().set(bearer('x'.repeat(43))))).status, 401, `${label} with an unknown token`);
    assert.equal((await withBody(call().set('x-user-id', '1'))).status, 401, `${label} with only x-user-id`);
  }
});

test('first registered user is Admin; later users are Agents and cannot choose their own role', async () => {
  assert.equal(db.prepare("SELECT role FROM users WHERE email = 'root@example.com'").get().role, 'Admin');

  const second = await signUp('Second', 'second@example.com', { role: 'Admin', status: 'Active' });
  assert.equal(second.user.role, 'Agent');
  assert.equal(db.prepare("SELECT role FROM users WHERE email = 'second@example.com'").get().role, 'Agent');
});

test('admin-only routes: Agent gets 403, Admin is let through', async () => {
  const admin = await logIn('root@example.com');
  const agent = await logIn('second@example.com');
  const adminOnly = [
    ['POST', '/api/settings'], ['POST', '/api/users'], ['PATCH', '/api/users/999'], ['DELETE', '/api/users/999'],
    ['POST', '/api/inboxes'], ['PATCH', '/api/inboxes/999'], ['DELETE', '/api/inboxes/999'],
    ['POST', '/api/webhooks'], ['DELETE', '/api/webhooks/999'], ['POST', '/api/connectors'],
    ['GET', '/api/auth/google/url'], ['POST', '/api/auth/google/sync'], ['POST', '/api/auth/google/disconnect'],
    ['POST', '/api/seed'],
  ];
  for (const [method, url] of adminOnly) {
    const asAgent = await request(app)[method.toLowerCase()](url).set(bearer(agent.token)).send({});
    assert.equal(asAgent.status, 403, `${method} ${url} as Agent`);
    const asAdmin = await request(app)[method.toLowerCase()](url).set(bearer(admin.token)).send({});
    assert.notEqual(asAdmin.status, 401, `${method} ${url} as Admin`);
    assert.notEqual(asAdmin.status, 403, `${method} ${url} as Admin`);
  }
});

test('the last active Admin cannot be demoted, disabled or deleted', async () => {
  const admin = await logIn('root@example.com');
  const id = admin.user.id;
  assert.equal((await request(app).patch(`/api/users/${id}`).set(bearer(admin.token)).send({ role: 'Agent' })).status, 409);
  assert.equal((await request(app).patch(`/api/users/${id}`).set(bearer(admin.token)).send({ status: 'Disabled' })).status, 409);
  assert.equal((await request(app).delete(`/api/users/${id}`).set(bearer(admin.token))).status, 409);
  assert.equal(db.prepare('SELECT role FROM users WHERE id = ?').get(id).role, 'Admin');
});

test('session tokens are random, stored only as a keyed hash, expire, and die on logout', async () => {
  const login = await logIn('second@example.com');
  assert.ok(login.token.length >= 43, 'at least 32 random bytes, base64url');

  const rows = db.prepare('SELECT token_hash FROM sessions').all().map(r => r.token_hash);
  assert.ok(!rows.includes(login.token), 'raw token must not be stored');
  assert.ok(rows.includes(hashToken(login.token)), 'keyed hash of the token is stored');

  assert.equal((await request(app).get('/api/auth/me').set(bearer(login.token))).status, 200);

  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() - 1000, hashToken(login.token));
  assert.equal((await request(app).get('/api/auth/me').set(bearer(login.token))).status, 401, 'expired');

  const fresh = await logIn('second@example.com');
  assert.equal((await request(app).post('/api/auth/logout').set(bearer(fresh.token))).status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(bearer(fresh.token))).status, 401, 'logged out');
});

test('a disabled user cannot sign in and existing sessions stop working', async () => {
  const victim = await signUp('Victim', 'victim@example.com');
  assert.equal((await request(app).get('/api/auth/me').set(bearer(victim.token))).status, 200);
  db.prepare("UPDATE users SET status = 'Disabled' WHERE email = 'victim@example.com'").run();
  assert.equal((await request(app).get('/api/auth/me').set(bearer(victim.token))).status, 401);
  const relogin = await request(app).post('/api/auth/login').send({ email: 'victim@example.com', password: PASSWORD });
  assert.equal(relogin.status, 403);
});

test('actor/author names come from the session, not from the request body', async () => {
  const agent = await logIn('second@example.com');
  const conv = (await request(app).post('/api/conversations').set(bearer(agent.token))
    .send({ subject: 'Hello', customer_email: 'cust@example.com', customer_name: 'Cust', actor_name: 'CEO' })).body;
  assert.equal(conv.activities.find(a => a.activity_type === 'created').actor_name, 'Second');

  const noted = await request(app).post(`/api/conversations/${conv.id}/notes`).set(bearer(agent.token))
    .send({ body: 'internal', author_name: 'CEO', author_id: 1 });
  assert.equal(noted.body.notes[0].author_name, 'Second');
  assert.equal(noted.body.notes[0].author_id, agent.user.id);

  const patched = await request(app).patch(`/api/conversations/${conv.id}`).set(bearer(agent.token))
    .send({ status: 'Pending', actor_name: 'CEO' });
  assert.ok(patched.body.activities.every(a => a.actor_name !== 'CEO'));
  assert.ok(patched.body.activities.some(a => a.activity_type === 'status_changed' && a.actor_name === 'Second'));

  const sent = await request(app).post(`/api/conversations/${conv.id}/messages`).set(bearer(agent.token))
    .send({ body: 'hi', sender_name: 'CEO', sender_email: 'ceo@example.com', is_agent_reply: 1 });
  const msg = sent.body.messages.at(-1);
  assert.equal(msg.sender_name, 'Second');
  assert.equal(msg.sender_email, 'second@example.com');
});

test('internal permalink resolves a conversation code for signed-in users only', async () => {
  const agent = await logIn('second@example.com');
  const code = db.prepare('SELECT conversation_code FROM conversations LIMIT 1').get().conversation_code;
  assert.equal((await request(app).get(`/api/conversations/by-code/${code}`)).status, 401);
  const ok = await request(app).get(`/api/conversations/by-code/${code}`).set(bearer(agent.token));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.conversation_code, code);
  assert.equal((await request(app).get('/api/conversations/by-code/NOPE').set(bearer(agent.token))).status, 404);
});

test('bootstrap never exposes password hashes', async () => {
  const admin = await logIn('root@example.com');
  const res = await request(app).get('/api/bootstrap').set(bearer(admin.token));
  assert.equal(res.status, 200);
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes('password_hash'));
  assert.ok(!text.includes('scrypt$'));
});

test('demo-login is gone and the OAuth callback rejects an unknown state', async () => {
  const admin = await logIn('root@example.com');
  const demo = await request(app).post('/api/auth/google/demo-login').set(bearer(admin.token)).send({ email: 'evil@example.com' });
  assert.equal(demo.status, 404);

  const before = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const cb = await request(app).get('/api/auth/google/callback').query({ code: 'abc', state: 'forged' });
  assert.equal(cb.status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users').get().c, before, 'callback must never create users');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM oauth_accounts').get().c, 0);
});
