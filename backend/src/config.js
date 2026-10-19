require('dotenv').config();
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const dbPath = env.THREADLY_DB_PATH || path.join(__dirname, '..', 'data', 'threadly.sqlite');

/**
 * Secrets must come from the environment in production. In development/test a random
 * secret is generated; for an on-disk database it is persisted next to the database
 * (mode 0600) so sessions survive restarts. It is never a hardcoded constant.
 */
function resolveSecret(name, minLength) {
  const fromEnv = env[name];
  if (fromEnv) {
    if (fromEnv.length < minLength) {
      throw new Error(`${name} must be at least ${minLength} characters.`);
    }
    return fromEnv;
  }
  if (isProduction) {
    throw new Error(`${name} is required when NODE_ENV=production. Generate one with: openssl rand -base64 48`);
  }
  if (dbPath === ':memory:') return crypto.randomBytes(48).toString('base64');

  const file = path.join(path.dirname(dbPath), '.dev-secrets.json');
  let stored = {};
  if (fs.existsSync(file)) {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  if (!stored[name]) {
    stored[name] = crypto.randomBytes(48).toString('base64');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(stored, null, 2), { mode: 0o600 });
    console.warn(`[config] ${name} not set; generated a development secret in ${file}`);
  }
  return stored[name];
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

const config = {
  isProduction,
  dbPath,
  sessionSecret: resolveSecret('SESSION_SECRET', 32),
  sessionTtlHours: Number(env.SESSION_TTL_HOURS) > 0 ? Number(env.SESSION_TTL_HOURS) : 24 * 7,
  // Self-service sign-up. The first account always becomes the Admin; later sign-ups are Agents.
  // Set ALLOW_REGISTRATION=false once your team has accounts to require admin-created users.
  allowRegistration: bool(env.ALLOW_REGISTRATION, true),
  allowSeed: bool(env.ALLOW_SEED, !isProduction),
  dashboardUrl: (env.DASHBOARD_URL || 'http://localhost:5173').replace(/\/$/, ''),
};

module.exports = config;
