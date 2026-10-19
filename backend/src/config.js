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

/**
 * ALLOWED_ORIGINS: comma-separated exact origins that may call the API from a browser,
 * e.g. "https://help.example.com,chrome-extension://<extension id>". Wildcards are rejected.
 * When unset, only the local Vite dev server is allowed outside production.
 */
function parseOrigins(raw) {
  const origins = (raw || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
  for (const origin of origins) {
    if (!/^[a-z][a-z0-9+.-]*:\/\/[^/\s*]+$/i.test(origin)) {
      throw new Error(`ALLOWED_ORIGINS contains an invalid origin "${origin}". Use exact origins such as https://app.example.com (no wildcards, no paths).`);
    }
  }
  return origins;
}

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = env.ALLOWED_ORIGINS ? parseOrigins(env.ALLOWED_ORIGINS) : (isProduction ? [] : DEV_ORIGINS);
const dashboardUrl = (env.DASHBOARD_URL || 'http://localhost:5173').replace(/\/$/, '');

// Host header allowlist (blocks DNS-rebinding against a locally bound server): loopback names plus
// the hostnames of every configured origin, plus anything listed in ALLOWED_HOSTS.
function hostnameOf(origin) {
  const match = /^https?:\/\/(\[[^\]]+\]|[^/:]+)/i.exec(origin);
  return match ? match[1].toLowerCase() : null;
}
const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
for (const o of [...allowedOrigins, dashboardUrl]) {
  const h = hostnameOf(o);
  if (h) allowedHosts.add(h);
}
for (const h of (env.ALLOWED_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)) allowedHosts.add(h);

const config = {
  isProduction,
  dbPath,
  port: Number(env.PORT) || 4000,
  // Loopback by default: the API is not reachable from other machines unless you opt in with HOST=0.0.0.0.
  host: env.HOST || '127.0.0.1',
  allowedOrigins,
  allowedHosts,
  trustProxy: env.TRUST_PROXY || false,
  sessionSecret: resolveSecret('SESSION_SECRET', 32),
  sessionTtlHours: Number(env.SESSION_TTL_HOURS) > 0 ? Number(env.SESSION_TTL_HOURS) : 24 * 7,
  // Self-service sign-up. The first account always becomes the Admin; later sign-ups are Agents.
  // Set ALLOW_REGISTRATION=false once your team has accounts to require admin-created users.
  allowRegistration: bool(env.ALLOW_REGISTRATION, true),
  allowSeed: bool(env.ALLOW_SEED, !isProduction),
  dashboardUrl,
};

module.exports = config;
