const test = require('node:test');
const assert = require('node:assert/strict');
process.env.THREADLY_DB_PATH = ':memory:';
const { generateConversationCode, generateToken } = require('../src/db');
const { analyzeSentiment, isThankYouReply, evaluateCondition } = require('../src/engine');

test('Token Generation', () => {
  const token1 = generateToken();
  const token2 = generateToken();
  
  assert.equal(typeof token1, 'string');
  assert.equal(token1.length, 48, 'Crypto token must be 48 hex characters (24 bytes)');
  assert.notEqual(token1, token2, 'Generated tokens must be distinct');
});

test('Conversation Code Generation', () => {
  const code = generateConversationCode();
  assert.match(code, /^\d{4}-[0-9A-F]{4}$/, 'Code must match XXXX-XXXX hex suffix format');
});

test('Session Management', () => {
  const { db, createSession, validateSession } = require('../src/db');
  db.prepare("INSERT OR IGNORE INTO users (id, name, email, role, status) VALUES (999, 'Test User', 'test@session.local', 'Admin', 'Active')").run();
  const token = createSession(999);
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 48);

  const session = validateSession(token);
  assert.ok(session, 'Valid session should return session object');
  assert.equal(session.id, 999);
  assert.equal(session.email, 'test@session.local');

  const invalid = validateSession('invalid-token-1234');
  assert.equal(invalid, null, 'Invalid token must return null');
});

test('Sentiment Analysis Engine', () => {
  const positive = analyzeSentiment('Thank you so much, this is great helpful service!');
  const negative = analyzeSentiment('This is urgent, broken, terrible and issue!');
  const neutral = analyzeSentiment('Please review the attached invoice PDF.');
  
  assert.equal(positive, 'Positive');
  assert.equal(negative, 'Frustrated / Urgent');
  assert.equal(neutral, 'Neutral');
});

test('Thank You Auto-Close Detection', () => {
  assert.equal(isThankYouReply('Thank you!'), true);
  assert.equal(isThankYouReply('Thanks a lot for your help.'), true);
  assert.equal(isThankYouReply('Can you please check why my order is delayed?'), false);
});

test('Rule Condition Evaluator', () => {
  assert.equal(evaluateCondition('Urgent Refund Request', 'contains', 'refund'), true);
  assert.equal(evaluateCondition('Urgent Refund Request', 'contains', 'shipping'), false);
  assert.equal(evaluateCondition('billing@company.com', 'ends_with', 'company.com'), true);
  assert.equal(evaluateCondition('Open', 'equals', 'open'), true);
});
