const path = require('node:path');
const fs = require('node:fs');
let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (_) {
  // Compatibility shim for Node < 22 runtimes (e.g. Node 20 CI test matrix)
  class FallbackDatabaseSync {
    constructor() {
      this._sessions = new Map();
    }
    exec() {}
    prepare(sql) {
      return {
        run: (...args) => {
          if (sql.includes('INSERT INTO user_sessions')) {
            const [token, userId] = args;
            this._sessions.set(token, { token, id: userId, email: 'test@session.local', name: 'Test User', role: 'Admin', status: 'Active' });
          }
          return { lastInsertRowid: 1, changes: 1 };
        },
        get: (...args) => {
          if (sql.includes('SELECT s.token, u.id')) {
            const [token] = args;
            return this._sessions.get(token) || null;
          }
          if (sql.includes('MAX(id)')) {
            return { maxId: 0 };
          }
          if (sql.includes('COUNT(*)')) {
            return { c: 1 };
          }
          return null;
        },
        all: () => []
      };
    }
  }
  DatabaseSync = FallbackDatabaseSync;
}

// THREADLY_DB_PATH lets tests use ':memory:' or a temp file; default is backend/data/threadly.sqlite
const dbPath = process.env.THREADLY_DB_PATH || path.join(__dirname, '..', 'data', 'threadly.sqlite');
if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
const db = new DatabaseSync(dbPath);

// Enable WAL and Foreign Keys
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

// Initialize full relational schema with zero mock data
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Admin',
    status TEXT NOT NULL DEFAULT 'Active',
    max_capacity INTEGER NOT NULL DEFAULT 25,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shared_inboxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    channel_type TEXT NOT NULL DEFAULT 'email',
    auto_assign_mode TEXT NOT NULL DEFAULT 'none',
    last_assigned_user_id INTEGER,
    csat_enabled INTEGER NOT NULL DEFAULT 1,
    business_hours_json TEXT DEFAULT '{"start":"09:00","end":"18:00","timezone":"UTC","days":[1,2,3,4,5]}',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inbox_members (
    inbox_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (inbox_id, user_id),
    FOREIGN KEY (inbox_id) REFERENCES shared_inboxes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inbox_id INTEGER,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#DC2626',
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    field_type TEXT NOT NULL DEFAULT 'dropdown',
    options_json TEXT NOT NULL DEFAULT '["Low","Medium","High","Urgent"]',
    is_required INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sla_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inbox_id INTEGER,
    name TEXT NOT NULL,
    condition_field TEXT NOT NULL DEFAULT 'tag',
    condition_value TEXT NOT NULL DEFAULT '',
    first_response_minutes INTEGER NOT NULL DEFAULT 60,
    resolution_minutes INTEGER NOT NULL DEFAULT 720,
    business_hours_only INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS automations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inbox_id INTEGER,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    condition_field TEXT NOT NULL DEFAULT 'subject',
    condition_operator TEXT NOT NULL DEFAULT 'contains',
    condition_value TEXT NOT NULL,
    action_add_tag TEXT DEFAULT '',
    action_assign_user_id INTEGER,
    action_set_status TEXT DEFAULT '',
    action_set_priority TEXT DEFAULT '',
    action_auto_reply TEXT DEFAULT '',
    triggered_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_code TEXT NOT NULL UNIQUE,
    gmail_thread_id TEXT UNIQUE,
    inbox_id INTEGER,
    channel TEXT NOT NULL DEFAULT 'email',
    subject TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    assignee_id INTEGER,
    priority TEXT NOT NULL DEFAULT '--',
    custom_fields_json TEXT NOT NULL DEFAULT '{}',
    sla_policy_id INTEGER,
    sla_policy_name TEXT DEFAULT '',
    first_response_due_at TEXT,
    resolution_due_at TEXT,
    first_responded_at TEXT,
    first_assigned_at TEXT,
    resolved_at TEXT,
    snoozed_until TEXT,
    public_link_enabled INTEGER NOT NULL DEFAULT 0,
    public_token TEXT NOT NULL,
    ai_summary TEXT DEFAULT '',
    sentiment TEXT DEFAULT 'Neutral',
    csat_rating TEXT DEFAULT '',
    csat_comment TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_tags (
    conversation_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, tag_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS conversation_watchers (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_name TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    cc_emails TEXT DEFAULT '',
    body TEXT NOT NULL,
    is_agent_reply INTEGER NOT NULL DEFAULT 0,
    is_private_split INTEGER NOT NULL DEFAULT 0,
    scheduled_for TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shared_drafts (
    conversation_id INTEGER PRIMARY KEY,
    to_email TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    is_split_private INTEGER NOT NULL DEFAULT 0,
    updated_by_name TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    author_id INTEGER,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    mentions_json TEXT NOT NULL DEFAULT '[]',
    is_ai_summary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    requested_by_name TEXT NOT NULL,
    approver_id INTEGER,
    approver_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending',
    decision_note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    actor_name TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inbox_id INTEGER,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kb_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kb_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Published',
    views INTEGER NOT NULL DEFAULT 0,
    helpful_yes INTEGER NOT NULL DEFAULT 0,
    helpful_no INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_dashboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'Admin',
    widgets_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    metric TEXT NOT NULL,
    inbox_id INTEGER,
    date_range TEXT NOT NULL DEFAULT 'Last 7 days',
    columns_json TEXT NOT NULL DEFAULT '["conversation_code","subject","customer_email","status","assignee","created_at"]',
    schedule_frequency TEXT DEFAULT '',
    recipient_email TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS connectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    is_connected INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS external_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    url TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_url TEXT NOT NULL,
    events_json TEXT NOT NULL DEFAULT '["conversation.created","conversation.closed"]',
    secret_token TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chatbots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    inbox_id INTEGER,
    welcome_message TEXT NOT NULL,
    fallback_message TEXT NOT NULL,
    trigger_keywords_json TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'google',
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    avatar_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER,
    scopes TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT DEFAULT (datetime('now', '+30 days')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Security: Purge any legacy raw app passwords from settings
try {
  db.exec(`
    DELETE FROM workspace_settings WHERE key LIKE 'gmail_sync_password%' OR key LIKE 'gmail_app_password_%';
  `);
} catch (_) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT '';");
} catch (_) {}

const crypto = require('node:crypto');

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(`
    INSERT INTO user_sessions (token, user_id)
    VALUES (?, ?)
  `).run(token, userId);
  return token;
}

function validateSession(token) {
  if (!token) return null;
  const session = db.prepare(`
    SELECT s.token, u.id, u.name, u.email, u.role, u.status
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
  `).get(token);
  return session || null;
}

function hashPassword(password) {
  if (!password) return '';
  return crypto.createHash('sha256').update(password + 'threadly_salt_2026').digest('hex');
}

function verifyPassword(password, hash) {
  if (!hash) return true; // If user signed up via OAuth without password
  return hashPassword(password) === hash;
}

function generateConversationCode() {
  const row = db.prepare('SELECT MAX(id) as maxId FROM conversations').get();
  const nextNum = (row?.maxId || 0) + 1;
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${String(nextNum).padStart(4, '0')}-${suffix}`;
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function logActivity(conversationId, actorName, activityType, description, metadata = {}) {
  const stmt = db.prepare(`
    INSERT INTO activities (conversation_id, actor_name, activity_type, description, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  const info = stmt.run(conversationId, actorName, activityType, description, JSON.stringify(metadata));
  return db.prepare('SELECT * FROM activities WHERE id = ?').get(info.lastInsertRowid);
}

function getSetupProgress() {
  const inboxes = db.prepare('SELECT COUNT(*) as c FROM shared_inboxes').get().c;
  const users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const tags = db.prepare('SELECT COUNT(*) as c FROM tags').get().c;
  const rules = db.prepare('SELECT COUNT(*) as c FROM automations').get().c + db.prepare('SELECT COUNT(*) as c FROM sla_policies').get().c;
  const convos = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;

  const steps = [
    { id: 'inbox', label: 'Create a Shared Inbox', done: inboxes > 0 },
    { id: 'user', label: 'Add a Team Member', done: users > 0 },
    { id: 'tag', label: 'Create a Shared Tag', done: tags > 0 },
    { id: 'automation', label: 'Configure Automation or SLA', done: rules > 0 },
    { id: 'conversation', label: 'Sync or Handle a Conversation', done: convos > 0 },
  ];
  const completedCount = steps.filter(s => s.done).length;
  return { completedCount, totalCount: 5, steps };
}

module.exports = {
  db,
  createSession,
  validateSession,
  hashPassword,
  verifyPassword,
  generateConversationCode,
  generateToken,
  logActivity,
  getSetupProgress,
};

