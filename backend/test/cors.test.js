process.env.THREADLY_DB_PATH = ':memory:';
process.env.ALLOWED_ORIGINS = 'https://help.example.com,chrome-extension://abcdefghijklmnop';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const { app, server, io } = require('../src/server');

const FOREIGN = 'https://evil.example';

test('a foreign Origin is rejected and receives no CORS headers', async () => {
  const res = await request(app).get('/api/health').set('Origin', FOREIGN);
  assert.equal(res.status, 403);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  assert.equal(res.headers['access-control-allow-credentials'], undefined);
});

test('a foreign preflight is rejected, never answered with "*" or a reflected origin', async () => {
  const res = await request(app).options('/api/conversations')
    .set('Origin', FOREIGN)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Private-Network', 'true');
  assert.equal(res.status, 403);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  assert.equal(res.headers['access-control-allow-private-network'], undefined);
});

test('state-changing requests from a foreign Origin are rejected before reaching the handler', async () => {
  const res = await request(app).post('/api/auth/login').set('Origin', FOREIGN)
    .send({ email: 'a@b.co', password: 'whatever-whatever' });
  assert.equal(res.status, 403);
});

test('"null", look-alike and scheme-mismatched origins are rejected', async () => {
  for (const origin of [
    'null',
    'https://help.example.com.evil.example',
    'http://help.example.com', // wrong scheme
    'https://help.example.com:8443', // wrong port
    'chrome-extension://someotherextension',
    'http://localhost:5173', // dev default does not apply once ALLOWED_ORIGINS is set
  ]) {
    const res = await request(app).get('/api/health').set('Origin', origin);
    assert.equal(res.status, 403, origin);
  }
});

test('an allowlisted origin is echoed exactly (never "*") and no Private-Network header is sent', async () => {
  for (const origin of ['https://help.example.com', 'chrome-extension://abcdefghijklmnop']) {
    const res = await request(app).get('/api/health').set('Origin', origin);
    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], origin);
    assert.match(res.headers.vary || '', /Origin/);
    assert.equal(res.headers['access-control-allow-private-network'], undefined);
    assert.equal(res.headers['access-control-allow-credentials'], undefined);
  }
  const pre = await request(app).options('/api/conversations').set('Origin', 'https://help.example.com')
    .set('Access-Control-Request-Method', 'POST');
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], 'https://help.example.com');
  assert.ok(!/x-user-id/i.test(pre.headers['access-control-allow-headers']));
  assert.equal(pre.headers['access-control-allow-private-network'], undefined);
});

test('requests without an Origin header (curl, same-origin navigations) still work and get no CORS headers', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  assert.equal(res.headers['access-control-allow-private-network'], undefined);
});

test('a Host header we do not serve is rejected (DNS-rebinding guard)', async () => {
  const res = await request(app).get('/api/health').set('Host', 'rebind.evil.example');
  assert.equal(res.status, 403);
  const same = await request(app).get('/api/health').set('Host', 'rebind.evil.example').set('Origin', 'http://rebind.evil.example');
  assert.equal(same.status, 403, 'same-origin to an unknown host is still refused');
});

test('ALLOWED_ORIGINS rejects wildcards and paths at startup', () => {
  for (const bad of ['*', 'https://*.example.com', 'https://example.com/app']) {
    const run = spawnSync(process.execPath, ['-e', "require('./src/config')"], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ALLOWED_ORIGINS: bad },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0, `${bad} must be refused`);
    assert.match(run.stderr, /ALLOWED_ORIGINS/);
  }
});

test('defaults: binds to loopback, and with no ALLOWED_ORIGINS only the Vite dev origins are allowed', () => {
  const run = spawnSync(process.execPath, ['-e', `
    const c = require('./src/config');
    console.log(JSON.stringify({ host: c.host, origins: c.allowedOrigins }));
  `], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ALLOWED_ORIGINS: '', HOST: '', THREADLY_DB_PATH: ':memory:' },
    encoding: 'utf8',
  });
  const out = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.equal(out.host, '127.0.0.1');
  assert.deepEqual(out.origins, ['http://localhost:5173', 'http://127.0.0.1:5173']);
});

test('websocket handshake from a foreign Origin is refused; from an allowlisted one it reaches auth', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const attempt = origin => new Promise(resolve => {
    const s = connect(url, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      auth: {},
      extraHeaders: { Origin: origin },
    });
    s.on('connect', () => { s.close(); resolve('connected'); });
    s.on('connect_error', err => { s.close(); resolve(err.message); });
  });
  try {
    const foreign = await attempt(FOREIGN);
    assert.notEqual(foreign, 'Authentication failed', 'foreign origin must be stopped before auth is even consulted');
    assert.notEqual(foreign, 'connected');
    assert.equal(await attempt('https://help.example.com'), 'Authentication failed');
  } finally {
    io.close();
    await new Promise(resolve => server.close(resolve));
  }
});
