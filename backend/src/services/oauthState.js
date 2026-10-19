const crypto = require('node:crypto');

// OAuth `state` values: random, single-use, short-lived and bound to the admin who started the flow.
// The callback is public (Google redirects the browser there without our Authorization header),
// so an unknown or replayed state is the only thing standing between it and an attacker.
const TTL_MS = 10 * 60 * 1000;
const pending = new Map();

function sweep(now) {
  for (const [state, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(state);
  }
}

function create(userId) {
  const now = Date.now();
  sweep(now);
  const state = crypto.randomBytes(24).toString('base64url');
  pending.set(state, { userId, expiresAt: now + TTL_MS });
  return state;
}

/** Returns the initiating user id, or null if the state is unknown, expired or already used. */
function consume(state) {
  if (typeof state !== 'string' || !state) return null;
  const entry = pending.get(state);
  if (!entry) return null;
  pending.delete(state);
  return entry.expiresAt > Date.now() ? entry.userId : null;
}

module.exports = { create, consume };
