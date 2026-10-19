#!/usr/bin/env node
// Recovery tool: set (or reset) a user's password and revoke their sessions.
//   THREADLY_NEW_PASSWORD='...' node scripts/set-password.js admin@example.com
// The password is read from the environment (not argv) so it does not land in shell history or `ps`.
const { db } = require('../src/db');
const { hashPassword } = require('../src/services/passwords');
const { destroySessionsForUser } = require('../src/services/sessions');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const password = process.env.THREADLY_NEW_PASSWORD || '';
  if (!email || password.length < 10) {
    console.error('Usage: THREADLY_NEW_PASSWORD=<at least 10 characters> node scripts/set-password.js <email>');
    process.exit(2);
  }
  const user = db.prepare('SELECT id, email FROM users WHERE LOWER(email) = ?').get(email);
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id);
  const revoked = destroySessionsForUser(user.id);
  console.log(`Password updated for ${user.email}; ${revoked} session(s) revoked.`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
