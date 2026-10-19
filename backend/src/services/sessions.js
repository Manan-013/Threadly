const crypto = require('node:crypto');
const { db } = require('../db');
const config = require('../config');

const TTL_MS = config.sessionTtlHours * 60 * 60 * 1000;

// Only a keyed hash of the token is stored, so a leaked database (or backup) cannot be
// replayed as live sessions. The raw token exists only in the client's possession.
function hashToken(token) {
  return crypto.createHmac('sha256', config.sessionSecret).update(token).digest('hex');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = now + TTL_MS;
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, now, expiresAt);
  return { token, expiresAt };
}

/** Returns the authenticated user (without secrets) or null for unknown/expired/disabled sessions. */
function validateSession(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT s.expires_at, u.id, u.name, u.email, u.role, u.status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash);
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  if (row.status === 'Disabled') return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, status: row.status };
}

function destroySession(token) {
  if (typeof token !== 'string') return 0;
  return Number(db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token)).changes);
}

function destroySessionsForUser(userId) {
  return Number(db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes);
}

function purgeExpiredSessions() {
  return Number(db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()).changes);
}

module.exports = {
  createSession,
  validateSession,
  destroySession,
  destroySessionsForUser,
  purgeExpiredSessions,
  hashToken,
};
