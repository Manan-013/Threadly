const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// scrypt cost parameters (OWASP minimum for scrypt is N=2^17,r=8,p=1 at 128 MiB; we use
// N=2^15 which needs 32 MiB per hash and keeps login latency reasonable on small hosts).
// Parameters are stored with every hash, so they can be raised later; needsRehash()
// reports hashes created with weaker parameters.
const PARAMS = { N: 1 << 15, r: 8, p: 1, keylen: 64, saltBytes: 16 };
const MAX_PASSWORD_LENGTH = 1024;
const MAX_N = 1 << 20;

// Hashes produced before this change: hex(sha256(password + hardcoded salt)).
// Only used to verify an old hash once so the account can be upgraded to scrypt.
const LEGACY_SALT = 'threadly_salt_2026';
const LEGACY_PATTERN = /^[0-9a-f]{64}$/;

function maxmemFor(N, r) {
  return 128 * N * r * 2;
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    throw new TypeError('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(PARAMS.saltBytes);
  const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: maxmemFor(PARAMS.N, PARAMS.r),
  });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

function parseScrypt(stored) {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const isPow2 = Number.isInteger(N) && N >= 2 && N <= MAX_N && (N & (N - 1)) === 0;
  if (!isPow2 || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const hash = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || hash.length < 16) return null;
  return { N, r, p, salt, hash };
}

function isLegacyHash(stored) {
  return typeof stored === 'string' && LEGACY_PATTERN.test(stored);
}

function legacyDigest(password) {
  return crypto.createHash('sha256').update(password + LEGACY_SALT).digest();
}

/**
 * Returns true only when `password` matches `stored`. An empty, missing or malformed
 * stored hash never authenticates (accounts without a password cannot sign in).
 */
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return false;
  if (typeof stored !== 'string' || stored.length === 0) return false;

  if (isLegacyHash(stored)) {
    return crypto.timingSafeEqual(legacyDigest(password), Buffer.from(stored, 'hex'));
  }

  const parsed = parseScrypt(stored);
  if (!parsed) return false;
  const derived = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: maxmemFor(parsed.N, parsed.r),
  });
  return crypto.timingSafeEqual(derived, parsed.hash);
}

/** True when a stored hash is legacy SHA-256 or uses weaker scrypt parameters than the current ones. */
function needsRehash(stored) {
  if (isLegacyHash(stored)) return true;
  const parsed = typeof stored === 'string' ? parseScrypt(stored) : null;
  if (!parsed) return false;
  return parsed.N < PARAMS.N || parsed.r < PARAMS.r || parsed.p < PARAMS.p;
}

let dummyHashPromise = null;
/** Burns the same CPU as a real check so unknown emails are not distinguishable by timing. */
async function verifyAgainstDummy(password) {
  dummyHashPromise = dummyHashPromise || hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(typeof password === 'string' ? password : '', await dummyHashPromise);
  return false;
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash,
  isLegacyHash,
  verifyAgainstDummy,
  MAX_PASSWORD_LENGTH,
};
