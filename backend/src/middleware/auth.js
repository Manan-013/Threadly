const { validateSession } = require('../services/sessions');

function extractBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}

/**
 * Authenticates via `Authorization: Bearer <session token>` only. There is no
 * "no users exist yet" bypass and no identity taken from client-supplied headers.
 */
function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  const user = token ? validateSession(token) : null;
  if (!user) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `${roles.join(' or ')} permission required.` });
    }
    next();
  };
}

const requireAdmin = requireRole('Admin');

// The only /api routes reachable without a session. Everything else is denied by default.
const PUBLIC_ROUTES = [
  { method: 'POST', pattern: /^\/auth\/register$/ },
  { method: 'POST', pattern: /^\/auth\/login$/ },
  { method: 'GET', pattern: /^\/health$/ },
  { method: 'GET', pattern: /^\/auth\/google\/callback$/ },
  // Customer-facing read-only permalink; guarded by an unguessable token and an opt-in flag.
  { method: 'GET', pattern: /^\/shared\/[^/]+$/ },
];

function isPublicRoute(req) {
  return PUBLIC_ROUTES.some(r => r.method === req.method && r.pattern.test(req.path));
}

/** Mounted once on `/api`: deny by default, so a forgotten route can never ship unauthenticated. */
function authGate(req, res, next) {
  if (isPublicRoute(req)) return next();
  return requireAuth(req, res, next);
}

module.exports = { requireAuth, requireRole, requireAdmin, authGate, isPublicRoute, extractBearerToken };
