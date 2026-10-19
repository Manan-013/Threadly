const nodemailer = require('nodemailer');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Pragmatic address check: one mailbox, no display name, no whitespace/control characters.
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const MAX_CC = 5;

function isValidEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && !/[\u0000-\u001f\u007f\s,;<>]/.test(value) // blocks CR/LF, tabs, NUL, lists and "Name <addr>" forms
    && EMAIL_PATTERN.test(value);
}

/** Rejects CR/LF/NUL anywhere in a value that will end up in a mail header. */
function assertNoHeaderInjection(value, field) {
  if (typeof value === 'string' && /[\r\n\u0000]/.test(value)) {
    throw new ValidationError(`${field} must not contain line breaks.`);
  }
}

/** Parses a comma/semicolon separated CC string into validated, de-duplicated addresses. */
function parseCcList(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (typeof raw !== 'string') throw new ValidationError('CC must be a comma-separated list of email addresses.');
  assertNoHeaderInjection(raw, 'CC');
  const seen = new Set();
  const list = [];
  for (const part of raw.split(/[,;]/)) {
    const address = part.trim();
    if (!address) continue;
    if (!isValidEmail(address)) throw new ValidationError(`"${address.slice(0, 80)}" is not a valid email address.`);
    if (!seen.has(address.toLowerCase())) {
      seen.add(address.toLowerCase());
      list.push(address);
    }
  }
  if (list.length > MAX_CC) throw new ValidationError(`At most ${MAX_CC} CC recipients are allowed.`);
  return list;
}

/** Display names are cosmetic; strip anything that could break out of the header. */
function safeDisplayName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f"<>\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function replySubject(subject) {
  const clean = String(subject || '(No Subject)').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300) || '(No Subject)';
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

/**
 * Builds the raw RFC 5322 message with nodemailer instead of concatenating header lines by hand,
 * so subjects/names are correctly encoded and cannot inject extra headers. All addresses are
 * validated first; this function refuses to build a message with an invalid one.
 */
async function buildRawMime({ fromAddress, fromName, to, cc = [], replyTo, subject, text }) {
  for (const [field, value] of [['From', fromAddress], ['To', to], ['Reply-To', replyTo]]) {
    if (value !== undefined && value !== null && !isValidEmail(value)) {
      throw new ValidationError(`${field} address "${String(value).slice(0, 80)}" is not valid.`);
    }
  }
  for (const address of cc) {
    if (!isValidEmail(address)) throw new ValidationError(`CC address "${String(address).slice(0, 80)}" is not valid.`);
  }
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
  const info = await transport.sendMail({
    from: { name: safeDisplayName(fromName), address: fromAddress },
    to: { name: '', address: to },
    cc: cc.map(address => ({ name: '', address })),
    replyTo: replyTo ? { name: '', address: replyTo } : undefined,
    subject: replySubject(subject),
    text: String(text ?? ''),
  });
  return info.message; // Buffer
}

module.exports = {
  ValidationError,
  isValidEmail,
  assertNoHeaderInjection,
  parseCcList,
  safeDisplayName,
  replySubject,
  buildRawMime,
  MAX_CC,
};
