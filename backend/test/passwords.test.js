const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  hashPassword,
  verifyPassword,
  needsRehash,
  isLegacyHash,
} = require('../src/services/passwords');

const legacyHash = pw => crypto.createHash('sha256').update(pw + 'threadly_salt_2026').digest('hex');

test('hashPassword produces a salted scrypt hash, never the plaintext', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.match(a, /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(a, b, 'same password must hash differently (random per-user salt)');
  assert.ok(!a.includes('correct horse'));
  assert.equal(needsRehash(a), false);
});

test('verifyPassword accepts the right password and rejects wrong/empty ones', async () => {
  const hash = await hashPassword('SuperSecret123!');
  assert.equal(await verifyPassword('SuperSecret123!', hash), true);
  assert.equal(await verifyPassword('WrongPassword', hash), false);
  assert.equal(await verifyPassword('', hash), false);
  assert.equal(await verifyPassword(undefined, hash), false);
  assert.equal(await verifyPassword('x'.repeat(5000), hash), false);
});

test('an empty or malformed stored hash never authenticates (no `!hash => true` bypass)', async () => {
  for (const stored of ['', null, undefined, 'garbage', 'scrypt$1$1$1$x$y', 'scrypt$32768$8$1$AAAA$BBBB', 'a'.repeat(64) + 'z']) {
    assert.equal(await verifyPassword('anything', stored), false, `stored=${String(stored)}`);
    assert.equal(await verifyPassword('', stored), false);
  }
});

test('legacy SHA-256 hashes still verify (once) and are flagged for rehash', async () => {
  const legacy = legacyHash('OldPassword!1');
  assert.equal(isLegacyHash(legacy), true);
  assert.equal(await verifyPassword('OldPassword!1', legacy), true);
  assert.equal(await verifyPassword('OldPassword!2', legacy), false);
  assert.equal(needsRehash(legacy), true);
});

test('hashes created with weaker scrypt parameters are flagged for rehash', async () => {
  const salt = crypto.randomBytes(16);
  const weak = crypto.scryptSync('pw-12345678', salt, 64, { N: 1024, r: 8, p: 1 });
  const stored = `scrypt$1024$8$1$${salt.toString('base64')}$${weak.toString('base64')}`;
  assert.equal(await verifyPassword('pw-12345678', stored), true);
  assert.equal(needsRehash(stored), true);
});
