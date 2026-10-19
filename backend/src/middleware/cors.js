const config = require('../config');

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization';

function hostnameOfHostHeader(hostHeader) {
  if (typeof hostHeader !== 'string') return '';
  const match = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(hostHeader.trim().toLowerCase());
  return match ? match[1] : '';
}

/** Rejects requests whose Host header is not one we serve (DNS-rebinding protection). */
function hostGuard(req, res, next) {
  if (!config.allowedHosts.has(hostnameOfHostHeader(req.headers.host))) {
    return res.status(403).json({ error: 'Host not allowed' });
  }
  next();
}

/**
 * An Origin is allowed when it is an exact entry of ALLOWED_ORIGINS, or when it is the origin
 * this server itself is being addressed as (the dashboard served from the same host).
 * Never reflects an arbitrary Origin and never uses "*".
 */
function isOriginAllowed(origin, hostHeader) {
  if (typeof origin !== 'string' || !origin || origin === 'null') return false;
  if (config.allowedOrigins.includes(origin)) return true;
  const match = /^https?:\/\/([^/]+)$/i.exec(origin);
  return Boolean(match && hostHeader && match[1].toLowerCase() === String(hostHeader).toLowerCase());
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (origin === undefined) {
    // Non-browser clients and same-origin navigations carry no Origin header.
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }

  if (!isOriginAllowed(origin, req.headers.host)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.setHeader('Access-Control-Max-Age', '600');
    return res.sendStatus(204);
  }
  next();
}

/** Socket.io: Express middleware does not run for the websocket upgrade, so check it here too. */
function socketAllowRequest(req, callback) {
  const origin = req.headers.origin;
  const allowed = origin === undefined
    || (config.allowedHosts.has(hostnameOfHostHeader(req.headers.host)) && isOriginAllowed(origin, req.headers.host));
  callback(allowed ? null : 'Origin not allowed', allowed);
}

function socketCorsOrigin(origin, callback) {
  // Called only when the browser sent an Origin; allowRequest above has already vetted Host + Origin.
  callback(null, config.allowedOrigins.includes(origin) ? origin : false);
}

module.exports = { hostGuard, corsMiddleware, isOriginAllowed, socketAllowRequest, socketCorsOrigin };
