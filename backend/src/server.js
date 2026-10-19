require('dotenv').config();
const express = require('express');
const http = require('node:http');
const cors = require('cors');
const { Server } = require('socket.io');
const {
  db,
  createSession,
  validateSession,
  generateConversationCode,
  generateToken,
  logActivity,
  getSetupProgress,
} = require('./db');
const {
  applySlaPolicies,
  evaluateAutomations,
  runAutoAssignment,
  analyzeSentiment,
  isThankYouReply,
  generateAiSummary,
  generateSmartReply,
} = require('./engine');
const {
  hashPassword,
  verifyPassword,
  needsRehash,
  verifyAgainstDummy,
} = require('./services/passwords');
const { seedWorkspaceData } = require('./seed');
const {
  getSavedGmailCredentials,
  syncGmailImap,
  sendGmailSmtp,
  bulkSyncFromExtension,
} = require('./gmailSync');
const {
  getOAuthConfig,
  getAuthUrl,
  exchangeCodeForTokens,
  getConnectedAccount,
  getValidAccessToken,
  syncGmailViaOAuth,
  sendGmailViaOAuth,
  disconnectGoogle,
  simulateDemoLogin,
} = require('./googleAuth');

const app = express();
const server = http.createServer(app);

// Safe allowed origins: local dev, local dashboard, and official Gmail domains
const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/localhost:(4000|5173)$/,
  /^http:\/\/127\.0\.0\.1:(4000|5173)$/,
  /^https:\/\/mail\.google\.com$/,
  /^chrome-extension:\/\//,
];

function isOriginAllowed(origin) {
  if (!origin) return true; // Server-to-server or same-origin
  return ALLOWED_ORIGIN_PATTERNS.some(pat => pat.test(origin));
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) callback(null, true);
      else callback(new Error('Origin blocked by CORS policy'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  },
});

// Socket.io handshake authentication
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  // If users exist in database, require valid session
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0 && token) {
    const session = validateSession(token);
    if (!session) {
      return next(new Error('Authentication failed'));
    }
    socket.user = session;
  }
  next();
});

// Origin & Private Network Access Protection
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  } else if (!origin) {
    // Same-origin or non-browser client
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  if (req.method === 'OPTIONS') {
    if (origin && !isOriginAllowed(origin)) {
      return res.status(403).send('Origin forbidden');
    }
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '5mb' }));

// Global Authentication Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const legacyUserId = req.headers['x-user-id'];

  // Check database user count. If zero users exist, allow first user setup
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    return next();
  }

  if (token) {
    const session = validateSession(token);
    if (session) {
      req.user = session;
      return next();
    }
  }

  // Fallback for active local session
  if (legacyUserId) {
    const u = db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').get(Number(legacyUserId));
    if (u) {
      req.user = u;
      return next();
    }
  }

  return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin permission required.' });
  }
  next();
}

// Track real-time presence per conversation for Collision Detection
// Map<conversationId, Map<socketId, { userName, userEmail, isTyping }>>
const conversationPresence = new Map();

function getPresenceList(conversationId) {
  const key = String(conversationId);
  if (!conversationPresence.has(key)) return [];
  return Array.from(conversationPresence.get(key).values());
}

function hydrateConversation(convId) {
  const conv = db.prepare(`
    SELECT c.*,
           i.name as inbox_name,
           i.email as inbox_email,
           u.name as assignee_name,
           u.email as assignee_email
    FROM conversations c
    LEFT JOIN shared_inboxes i ON i.id = c.inbox_id
    LEFT JOIN users u ON u.id = c.assignee_id
    WHERE c.id = ?
  `).get(convId);

  if (!conv) return null;

  const tags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN conversation_tags ct ON ct.tag_id = t.id
    WHERE ct.conversation_id = ?
    ORDER BY t.name ASC
  `).all(convId);

  const messages = db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC
  `).all(convId);

  const notes = db.prepare(`
    SELECT * FROM notes WHERE conversation_id = ? ORDER BY id DESC
  `).all(convId);

  const activities = db.prepare(`
    SELECT * FROM activities WHERE conversation_id = ? ORDER BY id DESC
  `).all(convId);

  const approvals = db.prepare(`
    SELECT * FROM approvals WHERE conversation_id = ? ORDER BY id DESC
  `).all(convId);

  const watchers = db.prepare(`
    SELECT u.id, u.name, u.email FROM users u
    JOIN conversation_watchers cw ON cw.user_id = u.id
    WHERE cw.conversation_id = ?
  `).all(convId);

  const sharedDraft = db.prepare(`
    SELECT * FROM shared_drafts WHERE conversation_id = ?
  `).get(convId) || { conversation_id: convId, to_email: conv.customer_email, body: '', is_split_private: 0, updated_by_name: '' };

  const externalLinks = db.prepare(`
    SELECT * FROM external_links WHERE conversation_id = ? ORDER BY id DESC
  `).all(convId);

  return {
    ...conv,
    custom_fields: JSON.parse(conv.custom_fields_json || '{}'),
    tags,
    messages,
    notes,
    activities,
    approvals,
    watchers,
    shared_draft: sharedDraft,
    external_links: externalLinks,
    presence: getPresenceList(convId),
  };
}

function broadcastConversationUpdate(convId) {
  const hydrated = hydrateConversation(convId);
  if (hydrated) {
    // Send full conversation payload ONLY to sockets joined to this conversation's room
    io.to(`conv_${convId}`).emit('conversation_updated', hydrated);

    // Broadcast only un-sensitive notification to global workspace sockets so lists can refresh
    io.emit('conversation_list_invalidated', {
      id: hydrated.id,
      inbox_id: hydrated.inbox_id,
      assignee_id: hydrated.assignee_id,
      status: hydrated.status,
      updated_at: hydrated.updated_at,
    });
  }
  io.emit('setup_updated', getSetupProgress());
}

// Socket.io Real-time Collaboration & Collision Detection
io.on('connection', (socket) => {
  socket.on('join_conversation', ({ conversationId, userName, userEmail }) => {
    const key = String(conversationId);
    socket.join(`conv_${key}`);
    if (!conversationPresence.has(key)) {
      conversationPresence.set(key, new Map());
    }
    conversationPresence.get(key).set(socket.id, {
      socketId: socket.id,
      userName: userName || 'Agent',
      userEmail: userEmail || '',
      isTyping: false,
    });
    io.to(`conv_${key}`).emit('presence_updated', {
      conversationId: Number(conversationId),
      presence: getPresenceList(key),
    });
  });

  socket.on('typing_status', ({ conversationId, isTyping }) => {
    const key = String(conversationId);
    if (conversationPresence.has(key) && conversationPresence.get(key).has(socket.id)) {
      const entry = conversationPresence.get(key).get(socket.id);
      entry.isTyping = !!isTyping;
      io.to(`conv_${key}`).emit('presence_updated', {
        conversationId: Number(conversationId),
        presence: getPresenceList(key),
      });
    }
  });

  socket.on('shared_draft_change', ({ conversationId, toEmail, body, isSplitPrivate, updatedByName }) => {
    const cid = Number(conversationId);
    if (!cid) return;
    db.prepare(`
      INSERT INTO shared_drafts (conversation_id, to_email, body, is_split_private, updated_by_name, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(conversation_id) DO UPDATE SET
        to_email = excluded.to_email,
        body = excluded.body,
        is_split_private = excluded.is_split_private,
        updated_by_name = excluded.updated_by_name,
        updated_at = datetime('now')
    `).run(cid, toEmail || '', body || '', isSplitPrivate ? 1 : 0, updatedByName || 'Team Member');

    socket.to(`conv_${cid}`).emit('shared_draft_synced', {
      conversation_id: cid,
      to_email: toEmail || '',
      body: body || '',
      is_split_private: isSplitPrivate ? 1 : 0,
      updated_by_name: updatedByName || 'Team Member',
    });
  });

  socket.on('leave_conversation', ({ conversationId }) => {
    const key = String(conversationId);
    socket.leave(`conv_${key}`);
    if (conversationPresence.has(key)) {
      conversationPresence.get(key).delete(socket.id);
      io.to(`conv_${key}`).emit('presence_updated', {
        conversationId: Number(conversationId),
        presence: getPresenceList(key),
      });
    }
  });

  socket.on('disconnect', () => {
    for (const [key, map] of conversationPresence.entries()) {
      if (map.has(socket.id)) {
        map.delete(socket.id);
        io.to(`conv_${key}`).emit('presence_updated', {
          conversationId: Number(key),
          presence: getPresenceList(key),
        });
      }
    }
  });
});

// ------------------------------------------------------------------
// 1. BOOTSTRAP & WORKSPACE SETTINGS
// ------------------------------------------------------------------
app.get('/api/bootstrap', (req, res) => {
  // Ensure no legacy 'Demo Inbox' exists in SQLite
  const demoInbox = db.prepare("SELECT * FROM shared_inboxes WHERE name = 'Demo Inbox'").get();
  if (demoInbox) {
    db.prepare("UPDATE shared_inboxes SET name = 'Team Inbox' WHERE id = ?").run(demoInbox.id);
    const dupTeamInboxes = db
      .prepare("SELECT id FROM shared_inboxes WHERE name = 'Team Inbox' AND id != ?")
      .all(demoInbox.id);
    for (const dup of dupTeamInboxes) {
      db.prepare('UPDATE conversations SET inbox_id = ? WHERE inbox_id = ?').run(demoInbox.id, dup.id);
      db.prepare('DELETE FROM shared_inboxes WHERE id = ?').run(dup.id);
    }
  }

  const users = db.prepare('SELECT * FROM users ORDER BY id ASC').all().map(u => {
    const assignedRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM conversations WHERE assignee_id = ? AND status != 'Closed'
    `).get(u.id);
    const followingRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM conversation_watchers WHERE user_id = ?
    `).get(u.id);
    return {
      ...u,
      assigned_count: assignedRow ? assignedRow.cnt : 0,
      following_count: followingRow ? followingRow.cnt : 0,
    };
  });
  const inboxes = db.prepare('SELECT * FROM shared_inboxes ORDER BY id ASC').all().map(inbox => {
    const members = db.prepare(`
      SELECT u.* FROM users u
      JOIN inbox_members im ON im.user_id = u.id
      WHERE im.inbox_id = ?
    `).all(inbox.id);
    const counts = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN assignee_id IS NULL AND status != 'Closed' THEN 1 ELSE 0 END) as unassigned,
        SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed_count,
        SUM(CASE WHEN assignee_id IS NOT NULL AND status != 'Closed' THEN 1 ELSE 0 END) as assigned_total
      FROM conversations WHERE inbox_id = ?
    `).get(inbox.id);
    const byUserRows = db.prepare(`
      SELECT assignee_id, COUNT(*) as cnt
      FROM conversations
      WHERE inbox_id = ? AND assignee_id IS NOT NULL AND status != 'Closed'
      GROUP BY assignee_id
    `).all(inbox.id);
    const by_user = {};
    for (const r of byUserRows) by_user[r.assignee_id] = r.cnt;

    return {
      ...inbox,
      business_hours: JSON.parse(inbox.business_hours_json || '{}'),
      members,
      counts: {
        total: counts.total || 0,
        unassigned: counts.unassigned || 0,
        open: counts.open_count || 0,
        pending: counts.pending_count || 0,
        closed: counts.closed_count || 0,
        assigned_total: counts.assigned_total || 0,
        by_user,
      },
    };
  });

  const tags = db.prepare('SELECT * FROM tags ORDER BY name ASC').all();
  const customFields = db.prepare('SELECT * FROM custom_fields ORDER BY id ASC').all().map(cf => ({
    ...cf,
    options: JSON.parse(cf.options_json || '[]'),
  }));
  const slaPolicies = db.prepare('SELECT * FROM sla_policies ORDER BY id ASC').all();
  const automations = db.prepare('SELECT * FROM automations ORDER BY id ASC').all();
  const templates = db.prepare('SELECT * FROM email_templates ORDER BY id DESC').all();
  const dashboards = db.prepare('SELECT * FROM custom_dashboards ORDER BY id DESC').all().map(d => ({
    ...d,
    widgets: JSON.parse(d.widgets_json || '[]'),
  }));
  const customReports = db.prepare('SELECT * FROM custom_reports ORDER BY id DESC').all().map(r => ({
    ...r,
    columns: JSON.parse(r.columns_json || '[]'),
  }));
  const connectors = db.prepare('SELECT * FROM connectors ORDER BY id ASC').all().map(c => ({
    ...c,
    config: JSON.parse(c.config_json || '{}'),
  }));
  const webhooks = db.prepare('SELECT id, name, target_url, events_json, is_active, created_at, SUBSTR(secret_token, 1, 4) || "••••••••" as masked_secret FROM webhooks ORDER BY id DESC').all().map(w => ({
    ...w,
    events: JSON.parse(w.events_json || '[]'),
  }));
  const chatbots = db.prepare('SELECT * FROM chatbots ORDER BY id DESC').all().map(cb => ({
    ...cb,
    trigger_keywords: JSON.parse(cb.trigger_keywords_json || '[]'),
  }));
  const settingsRows = db.prepare('SELECT * FROM workspace_settings').all();
  const settings = {};
  for (const r of settingsRows) settings[r.key] = r.value;

  res.json({
    setup: getSetupProgress(),
    users,
    inboxes,
    tags,
    customFields,
    slaPolicies,
    automations,
    templates,
    dashboards,
    customReports,
    connectors,
    webhooks,
    chatbots,
    settings,
  });
});

app.post('/api/settings', requireAuth, requireAdmin, (req, res) => {
  const { settings } = req.body;
  if (settings && typeof settings === 'object') {
    const stmt = db.prepare(`
      INSERT INTO workspace_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    for (const [k, v] of Object.entries(settings)) {
      stmt.run(k, String(v ?? ''));
    }
  }
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// 2. USERS & TEAM ROLES
// ------------------------------------------------------------------
app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { name, email, role = 'Agent', status = 'Active', max_capacity = 25 } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

  const existing = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
  if (existing) {
    db.prepare('UPDATE users SET name = ?, role = ?, status = ?, max_capacity = ? WHERE id = ?')
      .run(name.trim(), role, status, Number(max_capacity) || 25, existing.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
    io.emit('setup_updated', getSetupProgress());
    return res.json(updated);
  }

  const info = db.prepare(`
    INSERT INTO users (name, email, role, status, max_capacity)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), email.trim(), role, status, Number(max_capacity) || 25);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  io.emit('setup_updated', getSetupProgress());
  res.json(user);
});

app.patch('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { status, role, name, max_capacity } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare(`
    UPDATE users
    SET name = COALESCE(?, name),
        role = COALESCE(?, role),
        status = COALESCE(?, status),
        max_capacity = COALESCE(?, max_capacity)
    WHERE id = ?
  `).run(name ?? null, role ?? null, status ?? null, max_capacity !== undefined ? Number(max_capacity) : null, user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  io.emit('user_updated', updated);
  res.json(updated);
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  io.emit('setup_updated', getSetupProgress());
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// 3. SHARED INBOXES
// ------------------------------------------------------------------
app.post('/api/inboxes', (req, res) => {
  const {
    name,
    email,
    channel_type = 'email',
    auto_assign_mode = 'none',
    csat_enabled = 1,
    member_ids = [],
  } = req.body;

  if (!name || !email) return res.status(400).json({ error: 'Inbox name and email are required' });

  const existing = db.prepare('SELECT * FROM shared_inboxes WHERE LOWER(email) = LOWER(?)').get(email.trim());
  let inboxId;
  if (existing) {
    inboxId = existing.id;
    db.prepare(`
      UPDATE shared_inboxes SET name = ?, channel_type = ?, auto_assign_mode = ?, csat_enabled = ? WHERE id = ?
    `).run(name.trim(), channel_type, auto_assign_mode, csat_enabled ? 1 : 0, inboxId);
  } else {
    const info = db.prepare(`
      INSERT INTO shared_inboxes (name, email, channel_type, auto_assign_mode, csat_enabled)
      VALUES (?, ?, ?, ?, ?)
    `).run(name.trim(), email.trim(), channel_type, auto_assign_mode, csat_enabled ? 1 : 0);
    inboxId = info.lastInsertRowid;
  }

  if (Array.isArray(member_ids)) {
    db.prepare('DELETE FROM inbox_members WHERE inbox_id = ?').run(inboxId);
    const insertMember = db.prepare('INSERT OR IGNORE INTO inbox_members (inbox_id, user_id) VALUES (?, ?)');
    for (const uid of member_ids) insertMember.run(inboxId, Number(uid));
  }

  const inbox = db.prepare('SELECT * FROM shared_inboxes WHERE id = ?').get(inboxId);
  io.emit('setup_updated', getSetupProgress());
  res.json(inbox);
});

app.patch('/api/inboxes/:id', (req, res) => {
  const { name, auto_assign_mode, csat_enabled, business_hours, member_ids } = req.body;
  const inbox = db.prepare('SELECT * FROM shared_inboxes WHERE id = ?').get(req.params.id);
  if (!inbox) return res.status(404).json({ error: 'Inbox not found' });

  db.prepare(`
    UPDATE shared_inboxes
    SET name = COALESCE(?, name),
        auto_assign_mode = COALESCE(?, auto_assign_mode),
        csat_enabled = COALESCE(?, csat_enabled),
        business_hours_json = COALESCE(?, business_hours_json)
    WHERE id = ?
  `).run(
    name ?? null,
    auto_assign_mode ?? null,
    csat_enabled !== undefined ? (csat_enabled ? 1 : 0) : null,
    business_hours ? JSON.stringify(business_hours) : null,
    inbox.id
  );

  if (Array.isArray(member_ids)) {
    db.prepare('DELETE FROM inbox_members WHERE inbox_id = ?').run(inbox.id);
    const insertMember = db.prepare('INSERT OR IGNORE INTO inbox_members (inbox_id, user_id) VALUES (?, ?)');
    for (const uid of member_ids) insertMember.run(inbox.id, Number(uid));
  }

  const updated = db.prepare('SELECT * FROM shared_inboxes WHERE id = ?').get(inbox.id);
  res.json(updated);
});

app.delete('/api/inboxes/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM shared_inboxes WHERE id = ?').run(req.params.id);
  io.emit('setup_updated', getSetupProgress());
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// 4. SHARED TAGS & CUSTOM FIELDS
// ------------------------------------------------------------------
app.post('/api/tags', (req, res) => {
  const { name, color = '#DC2626', description = '', inbox_id = null } = req.body;
  if (!name) return res.status(400).json({ error: 'Tag name is required' });

  const existing = db.prepare('SELECT * FROM tags WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existing) {
    db.prepare('UPDATE tags SET color = ?, description = ? WHERE id = ?').run(color, description, existing.id);
    return res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(existing.id));
  }

  const info = db.prepare('INSERT INTO tags (inbox_id, name, color, description) VALUES (?, ?, ?, ?)')
    .run(inbox_id, name.trim(), color, description);
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid);
  io.emit('setup_updated', getSetupProgress());
  res.json(tag);
});

app.delete('/api/tags/:id', (req, res) => {
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  io.emit('setup_updated', getSetupProgress());
  res.json({ ok: true });
});

app.post('/api/custom-fields', (req, res) => {
  const { name, field_type = 'dropdown', options = [], is_required = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Field name is required' });
  const info = db.prepare(`
    INSERT INTO custom_fields (name, field_type, options_json, is_required)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET field_type = excluded.field_type, options_json = excluded.options_json
  `).run(name.trim(), field_type, JSON.stringify(options), is_required ? 1 : 0);

  const row = db.prepare('SELECT * FROM custom_fields WHERE id = ? OR name = ?').get(info.lastInsertRowid, name.trim());
  res.json({ ...row, options: JSON.parse(row.options_json || '[]') });
});

app.delete('/api/custom-fields/:id', (req, res) => {
  db.prepare('DELETE FROM custom_fields WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// 5. CONVERSATIONS & GMAIL EXTENSION SYNC
// ------------------------------------------------------------------
app.get('/api/conversations', requireAuth, (req, res) => {
  const { inbox_id, view, assignee_id, tag_id, channel, search } = req.query;
  let sql = `
    SELECT c.*,
           i.name as inbox_name,
           i.email as inbox_email,
           u.name as assignee_name,
           u.email as assignee_email
    FROM conversations c
    LEFT JOIN shared_inboxes i ON i.id = c.inbox_id
    LEFT JOIN users u ON u.id = c.assignee_id
    WHERE 1=1
  `;
  const params = [];

  if (inbox_id) {
    sql += ' AND c.inbox_id = ?';
    params.push(Number(inbox_id));
  }
  if (channel) {
    sql += ' AND c.channel = ?';
    params.push(channel);
  }
  if (view === 'unassigned') {
    sql += " AND c.assignee_id IS NULL AND c.status != 'Closed'";
  } else if ((view === 'assigned_to_me' || view === 'mine') && assignee_id) {
    sql += " AND c.assignee_id = ? AND c.status != 'Closed'";
    params.push(Number(assignee_id));
  } else if (view === 'following') {
    if (assignee_id) {
      sql += ' AND EXISTS (SELECT 1 FROM conversation_watchers cw WHERE cw.conversation_id = c.id AND cw.user_id = ?)';
      params.push(Number(assignee_id));
    } else {
      sql += ' AND EXISTS (SELECT 1 FROM conversation_watchers cw WHERE cw.conversation_id = c.id)';
    }
  } else if (view === 'team') {
    if (assignee_id) {
      sql += " AND c.assignee_id = ? AND c.status != 'Closed'";
      params.push(Number(assignee_id));
    } else {
      sql += " AND c.assignee_id IS NOT NULL AND c.status != 'Closed'";
    }
  } else if (view === 'open') {
    sql += " AND c.status = 'Open'";
  } else if (view === 'pending') {
    sql += " AND c.status = 'Pending'";
  } else if (view === 'closed') {
    sql += " AND c.status = 'Closed'";
  } else if (view === 'snoozed') {
    sql += ' AND c.snoozed_until IS NOT NULL';
  } else if (view === 'received') {
    sql += ' AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.is_agent_reply = 0)';
  } else if (view === 'sent') {
    sql += ' AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.is_agent_reply = 1)';
  }

  if (tag_id) {
    sql += ' AND EXISTS (SELECT 1 FROM conversation_tags ct WHERE ct.conversation_id = c.id AND ct.tag_id = ?)';
    params.push(Number(tag_id));
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    sql += ' AND (c.subject LIKE ? OR c.customer_name LIKE ? OR c.customer_email LIKE ? OR c.conversation_code LIKE ?)';
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY c.updated_at DESC, c.id DESC';

  const rows = db.prepare(sql).all(...params);
  const result = rows.map(r => {
    const tags = db.prepare(`
      SELECT t.* FROM tags t
      JOIN conversation_tags ct ON ct.tag_id = t.id
      WHERE ct.conversation_id = ?
    `).all(r.id);
    const lastMsg = db.prepare(`
      SELECT body, sender_name, created_at FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1
    `).get(r.id);
    return {
      ...r,
      tags,
      snippet: lastMsg ? lastMsg.body.slice(0, 140) : '',
      last_message_at: lastMsg ? lastMsg.created_at : r.created_at,
      presence: getPresenceList(r.id),
    };
  });

  res.json(result);
});

app.get('/api/conversations/:id', (req, res) => {
  const cid = Number(req.params.id);
  const conv = hydrateConversation(cid);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  res.json(conv);
});

// Public Share Permalink Lookup: requires explicit public_link_enabled = 1 and public_token match
app.get('/api/shared/:codeOrToken', (req, res) => {
  const token = req.params.codeOrToken;
  // Match only against public_token when public_link_enabled is true
  const row = db.prepare(`
    SELECT id FROM conversations
    WHERE public_token = ? AND public_link_enabled = 1
  `).get(token);

  if (!row) {
    return res.status(404).json({ error: 'Public link is disabled or invalid.' });
  }

  const full = hydrateConversation(row.id);
  if (!full) return res.status(404).json({ error: 'Conversation not found' });

  // Security: Never leak internal notes, watchers, or internal drafts over public permalinks
  const sanitized = {
    id: full.id,
    conversation_code: full.conversation_code,
    subject: full.subject,
    customer_name: full.customer_name,
    customer_email: full.customer_email,
    status: full.status,
    priority: full.priority,
    created_at: full.created_at,
    updated_at: full.updated_at,
    messages: (full.messages || []).filter(m => !m.is_private_split),
    tags: full.tags,
  };
  res.json(sanitized);
});

// Used by both the Dashboard (Compose / Receive Inbound) and Gmail Extension Sync
app.post('/api/conversations', (req, res) => {
  const {
    gmail_thread_id = null,
    inbox_id = null,
    channel = 'email',
    subject,
    customer_name,
    customer_email,
    recipient_email = '',
    body = '',
    actor_name = 'System',
  } = req.body;

  if (!subject || !customer_email) {
    return res.status(400).json({ error: 'Subject and customer email are required' });
  }

  // If gmail_thread_id already exists, return hydrated existing thread
  if (gmail_thread_id) {
    const existing = db.prepare('SELECT id FROM conversations WHERE gmail_thread_id = ?').get(gmail_thread_id);
    if (existing) {
      return res.json(hydrateConversation(existing.id));
    }
  }

  // Determine target shared inbox if not explicitly provided
  let targetInboxId = inbox_id;
  if (!targetInboxId) {
    const matchedInbox = recipient_email
      ? db.prepare('SELECT id FROM shared_inboxes WHERE LOWER(email) = LOWER(?)').get(recipient_email.trim())
      : null;
    if (matchedInbox) {
      targetInboxId = matchedInbox.id;
    } else {
      const firstInbox = db.prepare('SELECT id FROM shared_inboxes ORDER BY id ASC LIMIT 1').get();
      if (firstInbox) targetInboxId = firstInbox.id;
    }
  }

  const inboxRow = targetInboxId ? db.prepare('SELECT * FROM shared_inboxes WHERE id = ?').get(targetInboxId) : null;
  const code = generateConversationCode();
  const token = generateToken();
  const sentiment = analyzeSentiment(`${subject} ${body}`);

  const info = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, priority, public_token, sentiment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', '--', ?, ?)
  `).run(
    code,
    gmail_thread_id,
    targetInboxId,
    channel,
    subject.trim(),
    (customer_name || customer_email.split('@')[0]).trim(),
    customer_email.trim(),
    token,
    sentiment
  );

  const convId = info.lastInsertRowid;

  if (body && body.trim()) {
    db.prepare(`
      INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(
      convId,
      (customer_name || customer_email.split('@')[0]).trim(),
      customer_email.trim(),
      recipient_email || (inboxRow ? inboxRow.email : 'inbox@threadly.app'),
      body.trim()
    );
  }

  logActivity(
    convId,
    actor_name,
    'created',
    `New conversation received in ${inboxRow ? inboxRow.name : 'Shared Inbox'}.`,
    { inboxName: inboxRow ? inboxRow.name : 'Shared Inbox' }
  );

  // Run Automations, Auto-Assignment, and SLA Policies
  evaluateAutomations(convId, body);
  runAutoAssignment(convId);
  applySlaPolicies(convId);

  const hydrated = hydrateConversation(convId);
  io.emit('conversation_created', hydrated);
  io.emit('setup_updated', getSetupProgress());
  res.json(hydrated);
});

// Update Assignee, Status, Priority, Custom Fields, Public Link, Snooze, CSAT
app.patch('/api/conversations/:id', (req, res) => {
  const convId = Number(req.params.id);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const {
    assignee_id,
    status,
    priority,
    inbox_id,
    custom_fields,
    public_link_enabled,
    snoozed_until,
    csat_rating,
    csat_comment,
    actor_name = 'You',
  } = req.body;

  if (inbox_id !== undefined && Number(inbox_id) !== conv.inbox_id) {
    db.prepare('UPDATE conversations SET inbox_id = ?, updated_at = datetime(' + "'now'" + ') WHERE id = ?')
      .run(inbox_id ? Number(inbox_id) : null, convId);
  }

  if (assignee_id !== undefined && assignee_id !== conv.assignee_id) {
    const newAssigneeId = assignee_id ? Number(assignee_id) : null;
    db.prepare(`
      UPDATE conversations
      SET assignee_id = ?,
          first_assigned_at = CASE WHEN ? IS NOT NULL THEN COALESCE(first_assigned_at, datetime('now')) ELSE first_assigned_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(newAssigneeId, newAssigneeId, convId);

    if (newAssigneeId) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(newAssigneeId);
      const firstName = u ? u.name.split(' ')[0] : 'Team Member';
      logActivity(convId, actor_name, 'assigned', `${actor_name} assigned to ${firstName}.`, {
        assigneeId: newAssigneeId,
        assigneeName: u ? u.name : firstName,
      });
    } else {
      logActivity(convId, actor_name, 'assigned', `${actor_name} unassigned this conversation.`);
    }
  }

  if (status !== undefined && status !== conv.status) {
    db.prepare(`
      UPDATE conversations
      SET status = ?,
          resolved_at = CASE WHEN ? = 'Closed' THEN datetime('now') ELSE resolved_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(status, status, convId);

    logActivity(convId, actor_name, 'status_changed', `${actor_name} changed status to ${status}.`, { status });
  }

  if (priority !== undefined && priority !== conv.priority) {
    db.prepare(`UPDATE conversations SET priority = ?, updated_at = datetime('now') WHERE id = ?`).run(priority, convId);
    logActivity(convId, actor_name, 'priority_changed', `${actor_name} set priority to ${priority}.`, { priority });
    applySlaPolicies(convId);
  }

  if (custom_fields && typeof custom_fields === 'object') {
    const merged = { ...JSON.parse(conv.custom_fields_json || '{}'), ...custom_fields };
    db.prepare(`UPDATE conversations SET custom_fields_json = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(merged), convId);
  }

  if (public_link_enabled !== undefined) {
    db.prepare(`UPDATE conversations SET public_link_enabled = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(public_link_enabled ? 1 : 0, convId);
  }

  if (snoozed_until !== undefined) {
    db.prepare(`UPDATE conversations SET snoozed_until = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(snoozed_until || null, convId);
    if (snoozed_until) {
      logActivity(convId, actor_name, 'snoozed', `${actor_name} snoozed conversation until ${new Date(snoozed_until).toLocaleString()}.`);
    }
  }

  if (csat_rating !== undefined) {
    db.prepare(`UPDATE conversations SET csat_rating = ?, csat_comment = COALESCE(?, csat_comment), updated_at = datetime('now') WHERE id = ?`)
      .run(csat_rating, csat_comment ?? null, convId);
    logActivity(convId, conv.customer_name, 'csat_submitted', `Customer submitted CSAT rating: ${csat_rating}.`);
  }

  broadcastConversationUpdate(convId);
  res.json(hydrateConversation(convId));
});

// Add Tag to Conversation
app.post('/api/conversations/:id/tags', (req, res) => {
  const convId = Number(req.params.id);
  const { tag_id, tag_name, color = '#DC2626', actor_name = 'You' } = req.body;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  let tag = null;
  if (tag_id) {
    tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(Number(tag_id));
  } else if (tag_name) {
    tag = db.prepare('SELECT * FROM tags WHERE LOWER(name) = LOWER(?)').get(tag_name.trim());
    if (!tag) {
      const info = db.prepare('INSERT INTO tags (inbox_id, name, color) VALUES (?, ?, ?)').run(
        conv.inbox_id || null,
        tag_name.trim(),
        color
      );
      tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid);
    }
  }

  if (!tag) return res.status(400).json({ error: 'Valid tag required' });

  const exists = db.prepare('SELECT 1 FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?').get(convId, tag.id);
  if (!exists) {
    db.prepare('INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)').run(convId, tag.id);
    logActivity(convId, actor_name, 'tag_added', `${actor_name} applied ${tag.name} tag.`, {
      tagId: tag.id,
      tagName: tag.name,
    });
    applySlaPolicies(convId);
  }

  broadcastConversationUpdate(convId);
  res.json(hydrateConversation(convId));
});

// Remove Tag from Conversation
app.delete('/api/conversations/:id/tags/:tagId', (req, res) => {
  const convId = Number(req.params.id);
  const tagId = Number(req.params.tagId);
  const actorName = req.query.actor_name || 'You';

  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
  const deleted = db.prepare('DELETE FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?').run(convId, tagId);

  if (deleted.changes > 0 && tag) {
    logActivity(convId, actorName, 'tag_removed', `${actorName} removed ${tag.name} tag.`, {
      tagId: tag.id,
      tagName: tag.name,
    });
  }

  broadcastConversationUpdate(convId);
  res.json(hydrateConversation(convId));
});

// Send Reply / Message / Split Conversation / Send & Close / Send Later
app.post('/api/conversations/:id/messages', (req, res) => {
  const convId = Number(req.params.id);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const {
    sender_name,
    sender_email,
    recipient_email,
    cc_emails = '',
    body,
    is_agent_reply = 1,
    is_private_split = 0,
    scheduled_for = null,
    close_on_send = false,
  } = req.body;

  if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required' });

  const msgStatus = scheduled_for ? 'scheduled' : 'sent';
  const insertInfo = db.prepare(`
    INSERT INTO messages (
      conversation_id, sender_name, sender_email, recipient_email, cc_emails,
      body, is_agent_reply, is_private_split, scheduled_for, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    convId,
    sender_name || (is_agent_reply ? 'Agent' : conv.customer_name),
    sender_email || (is_agent_reply ? 'agent@threadly.app' : conv.customer_email),
    recipient_email || (is_agent_reply ? conv.customer_email : 'inbox@threadly.app'),
    cc_emails,
    body.trim(),
    is_agent_reply ? 1 : 0,
    is_private_split ? 1 : 0,
    scheduled_for,
    msgStatus
  );
  const msgId = insertInfo.lastInsertRowid;

  // Clear shared draft once sent
  if (is_agent_reply) {
    db.prepare('DELETE FROM shared_drafts WHERE conversation_id = ?').run(convId);
    db.prepare(`
      UPDATE conversations
      SET first_responded_at = COALESCE(first_responded_at, datetime('now')),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(convId);

    if (is_private_split) {
      logActivity(convId, sender_name || 'You', 'split_conversation', `${sender_name || 'You'} replied privately via Split conversation.`);
    } else if (scheduled_for) {
      logActivity(convId, sender_name || 'You', 'replied', `${sender_name || 'You'} scheduled a reply for ${new Date(scheduled_for).toLocaleString()}.`);
    } else {
      logActivity(convId, sender_name || 'You', 'replied', `${sender_name || 'You'} replied to ${conv.customer_name}.`);
    }

    if (close_on_send) {
      db.prepare(`UPDATE conversations SET status = 'Closed', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(convId);
      logActivity(convId, sender_name || 'You', 'status_changed', `${sender_name || 'You'} closed conversation via Send & Close.`);
    }

    if (!scheduled_for) {
      const oauthAcc = getConnectedAccount();
      // Ensure sender is restricted to connected email or provisioned team inbox
      const allowedSenders = [oauthAcc?.email, conv.inbox_email, req.user?.email].filter(Boolean).map(e => e.toLowerCase());
      const targetFromEmail = (sender_email && allowedSenders.includes(sender_email.toLowerCase()))
        ? sender_email
        : (oauthAcc?.email || conv.inbox_email || 'support@threadly.app');

      // Only allow sending to the customer's actual conversation thread email or explicit verified recipient
      const targetToEmail = recipient_email ? recipient_email.trim() : conv.customer_email;

      if (oauthAcc?.email) {
        sendGmailViaOAuth({
          email: oauthAcc.email,
          to: targetToEmail,
          subject: conv.subject.startsWith('Re:') ? conv.subject : `Re: ${conv.subject}`,
          body: body.trim(),
        }).catch(err => {
          console.warn('Google OAuth send failed:', err.message);
          db.prepare('UPDATE messages SET status = "failed" WHERE id = ?').run(msgId);
          logActivity(convId, 'System', 'delivery_failed', `Failed to deliver email: ${err.message}`);
          broadcastConversationUpdate(convId);
        });
      } else {
        sendGmailSmtp({
          fromEmail: targetFromEmail,
          fromName: sender_name || 'Support Team',
          toEmail: targetToEmail,
          ccEmails: cc_emails,
          subject: conv.subject.startsWith('Re:') ? conv.subject : `Re: ${conv.subject}`,
          body: body.trim(),
        }).catch(err => {
          console.warn('SMTP send failed:', err.message);
          db.prepare('UPDATE messages SET status = "failed" WHERE id = ?').run(msgId);
          logActivity(convId, 'System', 'delivery_failed', `Failed to deliver email via SMTP: ${err.message}`);
          broadcastConversationUpdate(convId);
        });
      }
    }
  } else {
    // Customer reply: check AI Thank-You Detector if conversation is currently Closed
    if (conv.status === 'Closed' && isThankYouReply(body)) {
      logActivity(
        convId,
        'Threadly AI',
        'automation_triggered',
        'AI Auto-Closer detected a thank-you reply and kept the conversation Closed.'
      );
    } else if (conv.status === 'Closed') {
      db.prepare(`UPDATE conversations SET status = 'Open', updated_at = datetime('now') WHERE id = ?`).run(convId);
      logActivity(convId, conv.customer_name, 'status_changed', 'Conversation reopened by customer reply.');
    }
  }

  broadcastConversationUpdate(convId);
  res.json(hydrateConversation(convId));
});

// Internal Notes (+ Add a note... or Save as note from AI Summarizer)
app.post('/api/conversations/:id/notes', (req, res) => {
  const convId = Number(req.params.id);
  const { author_id = null, author_name = 'You', body, is_ai_summary = 0 } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Note text is required' });

  const mentions = (body.match(/@[\w.-]+/g) || []).map(m => m.slice(1));
  db.prepare(`
    INSERT INTO notes (conversation_id, author_id, author_name, body, mentions_json, is_ai_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(convId, author_id, author_name, body.trim(), JSON.stringify(mentions), is_ai_summary ? 1 : 0);

  logActivity(
    convId,
    author_name,
    'note_added',
    is_ai_summary ? `${author_name} saved AI Summary as a note.` : `${author_name} added a note: "${body.trim().slice(0, 60)}"`,
    { isAiSummary: !!is_ai_summary, mentions }
  );

  broadcastConversationUpdate(convId);
  res.json(hydrateConversation(convId));
});

// AI Summarizer & AI Smart Compose
app.post('/api/conversations/:id/ai-summarize', async (req, res) => {
  const convId = Number(req.params.id);
  const summary = await generateAiSummary(convId);
  res.json({ summary });
});

app.post('/api/conversations/:id/ai-reply', (req, res) => {
  const convId = Number(req.params.id);
  const { mode = 'professional', prompt = '' } = req.body;
  const reply = generateSmartReply(convId, mode, prompt);
  res.json({ reply });
});

// Approvals Workflow
app.post('/api/conversations/:id/approvals', (req, res) => {
  const convId = Number(req.params.id);
  const { requested_by_name = 'You', approver_id = null, approver_name = 'Manager', title, description = '' } = req.body;
  if (!title) return res.status(400).json({ error: 'Approval title is required' });

  db.prepare(`
    INSERT INTO approvals (conversation_id, requested_by_name, approver_id, approver_name, title, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(convId, requested_by_name, approver_id, approver_name, title.trim(), description.trim());

  logActivity(convId, requested_by_name, 'approval_requested', `${requested_by_name} requested approval from ${approver_name}: "${title.trim()}".`);
  broadcastConversationUpdate(convId);
  res.json(hydrateConversation(convId));
});

app.patch('/api/approvals/:id', (req, res) => {
  const { status, decision_note = '', actor_name = 'Approver' } = req.body;
  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });

  db.prepare(`
    UPDATE approvals SET status = ?, decision_note = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, decision_note, approval.id);

  logActivity(
    approval.conversation_id,
    actor_name,
    'approval_updated',
    `${actor_name} ${status.toLowerCase()} request "${approval.title}".`
  );

  broadcastConversationUpdate(approval.conversation_id);
  res.json(hydrateConversation(approval.conversation_id));
});

// Watchers / Collaborators (Eye icon in top thread bar)
app.post('/api/conversations/:id/watchers', (req, res) => {
  const convId = Number(req.params.id);
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const exists = db.prepare('SELECT 1 FROM conversation_watchers WHERE conversation_id = ? AND user_id = ?').get(convId, Number(user_id));
  if (exists) {
    db.prepare('DELETE FROM conversation_watchers WHERE conversation_id = ? AND user_id = ?').run(convId, Number(user_id));
  } else {
    db.prepare('INSERT INTO conversation_watchers (conversation_id, user_id) VALUES (?, ?)').run(convId, Number(user_id));
  }

  broadcastConversationUpdate(convId);
  res.json(hydrateConversation(convId));
});

// External Integration Cards (Jira, Salesforce, Asana, QuickBooks, Slack)
app.post('/api/conversations/:id/external-links', (req, res) => {
  const convId = Number(req.params.id);
  const { provider, external_id, title, status = 'Open', url = '', actor_name = 'You' } = req.body;
  if (!provider || !title) return res.status(400).json({ error: 'Provider and title required' });

  db.prepare(`
    INSERT INTO external_links (conversation_id, provider, external_id, title, status, url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(convId, provider, external_id || `EXT-${Math.floor(100 + Math.random() * 900)}`, title.trim(), status, url);

  logActivity(convId, actor_name, 'integration_linked', `${actor_name} linked ${provider.toUpperCase()} item: ${title.trim()}.`);
  broadcastConversationUpdate(convId);
  res.json(hydrateConversation(convId));
});

// ------------------------------------------------------------------
// 6. EMAIL TEMPLATES
// ------------------------------------------------------------------
app.post('/api/templates', (req, res) => {
  const { name, category = 'General', subject = '', body, inbox_id = null, created_by = 'Admin' } = req.body;
  if (!name || !body) return res.status(400).json({ error: 'Template name and body are required' });

  const info = db.prepare(`
    INSERT INTO email_templates (inbox_id, name, category, subject, body, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(inbox_id, name.trim(), category.trim(), subject.trim(), body.trim(), created_by);

  const tpl = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(info.lastInsertRowid);
  res.json(tpl);
});

app.delete('/api/templates/:id', (req, res) => {
  db.prepare('DELETE FROM email_templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// 7. AUTOMATIONS & SLA POLICIES
// ------------------------------------------------------------------
app.post('/api/automations', (req, res) => {
  const {
    inbox_id = null,
    name,
    condition_field = 'subject',
    condition_operator = 'contains',
    condition_value,
    action_add_tag = '',
    action_assign_user_id = null,
    action_set_status = '',
    action_set_priority = '',
  } = req.body;

  if (!name || !condition_value) return res.status(400).json({ error: 'Rule name and condition value are required' });

  const info = db.prepare(`
    INSERT INTO automations (
      inbox_id, name, condition_field, condition_operator, condition_value,
      action_add_tag, action_assign_user_id, action_set_status, action_set_priority
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    inbox_id || null,
    name.trim(),
    condition_field,
    condition_operator,
    condition_value.trim(),
    action_add_tag.trim(),
    action_assign_user_id ? Number(action_assign_user_id) : null,
    action_set_status,
    action_set_priority
  );

  const rule = db.prepare('SELECT * FROM automations WHERE id = ?').get(info.lastInsertRowid);
  io.emit('setup_updated', getSetupProgress());
  res.json(rule);
});

app.patch('/api/automations/:id', (req, res) => {
  const { is_active } = req.body;
  db.prepare('UPDATE automations SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
  res.json(db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id));
});

app.delete('/api/automations/:id', (req, res) => {
  db.prepare('DELETE FROM automations WHERE id = ?').run(req.params.id);
  io.emit('setup_updated', getSetupProgress());
  res.json({ ok: true });
});

app.post('/api/sla-policies', (req, res) => {
  const {
    inbox_id = null,
    name,
    condition_field = 'tag',
    condition_value = '',
    first_response_minutes = 60,
    resolution_minutes = 720,
    business_hours_only = 0,
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Policy name is required' });

  const info = db.prepare(`
    INSERT INTO sla_policies (
      inbox_id, name, condition_field, condition_value,
      first_response_minutes, resolution_minutes, business_hours_only
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    inbox_id || null,
    name.trim(),
    condition_field,
    condition_value.trim(),
    Number(first_response_minutes) || 60,
    Number(resolution_minutes) || 720,
    business_hours_only ? 1 : 0
  );

  const policy = db.prepare('SELECT * FROM sla_policies WHERE id = ?').get(info.lastInsertRowid);
  io.emit('setup_updated', getSetupProgress());
  res.json(policy);
});

app.delete('/api/sla-policies/:id', (req, res) => {
  db.prepare('DELETE FROM sla_policies WHERE id = ?').run(req.params.id);
  io.emit('setup_updated', getSetupProgress());
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// 8. KNOWLEDGE BASE & CUSTOMER PORTAL
// ------------------------------------------------------------------
app.get('/api/kb', (req, res) => {
  const categories = db.prepare('SELECT * FROM kb_categories ORDER BY id ASC').all();
  const articles = db.prepare(`
    SELECT a.*, c.name as category_name
    FROM kb_articles a
    LEFT JOIN kb_categories c ON c.id = a.category_id
    ORDER BY a.id DESC
  `).all();
  res.json({ categories, articles });
});

app.post('/api/kb/categories', (req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const info = db.prepare(`
    INSERT INTO kb_categories (name, description) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET description = excluded.description
  `).run(name.trim(), description.trim());
  const cat = db.prepare('SELECT * FROM kb_categories WHERE id = ? OR name = ?').get(info.lastInsertRowid, name.trim());
  res.json(cat);
});

app.post('/api/kb/articles', (req, res) => {
  const { category_id = null, title, content, status = 'Published' } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const info = db.prepare(`
    INSERT INTO kb_articles (category_id, title, slug, content, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(category_id ? Number(category_id) : null, title.trim(), slug, content.trim(), status);
  res.json(db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/kb/articles/:id', (req, res) => {
  db.prepare('DELETE FROM kb_articles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// 9. CONNECTORS, CHATBOTS & WEBHOOKS (ADMIN PANEL)
// ------------------------------------------------------------------
app.post('/api/connectors', (req, res) => {
  const { provider, is_connected, config = {} } = req.body;
  if (!provider) return res.status(400).json({ error: 'Provider is required' });

  db.prepare(`
    INSERT INTO connectors (provider, is_connected, config_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      is_connected = excluded.is_connected,
      config_json = excluded.config_json,
      updated_at = datetime('now')
  `).run(provider, is_connected ? 1 : 0, JSON.stringify(config));

  const row = db.prepare('SELECT * FROM connectors WHERE provider = ?').get(provider);
  res.json({ ...row, config: JSON.parse(row.config_json || '{}') });
});

app.post('/api/chatbots', (req, res) => {
  const { name, inbox_id = null, welcome_message, fallback_message, trigger_keywords = [] } = req.body;
  if (!name || !welcome_message) return res.status(400).json({ error: 'Chatbot name and welcome message required' });
  const info = db.prepare(`
    INSERT INTO chatbots (name, inbox_id, welcome_message, fallback_message, trigger_keywords_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), inbox_id, welcome_message.trim(), (fallback_message || '').trim(), JSON.stringify(trigger_keywords));
  const row = db.prepare('SELECT * FROM chatbots WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ...row, trigger_keywords: JSON.parse(row.trigger_keywords_json || '[]') });
});

app.delete('/api/chatbots/:id', (req, res) => {
  db.prepare('DELETE FROM chatbots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/webhooks', (req, res) => {
  const { name, target_url, events = ['conversation.created', 'conversation.closed'] } = req.body;
  if (!name || !target_url) return res.status(400).json({ error: 'Name and target URL required' });
  const secret = 'whsec_' + generateToken();
  const info = db.prepare(`
    INSERT INTO webhooks (name, target_url, events_json, secret_token)
    VALUES (?, ?, ?, ?)
  `).run(name.trim(), target_url.trim(), JSON.stringify(events), secret);
  const row = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ...row, events: JSON.parse(row.events_json || '[]') });
});

app.delete('/api/webhooks/:id', (req, res) => {
  db.prepare('DELETE FROM webhooks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// 10. ANALYTICS, CUSTOM DASHBOARDS, CUSTOM REPORTS & CSV EXPORTS
// ------------------------------------------------------------------
app.get('/api/analytics', (req, res) => {
  const { inbox_id } = req.query;
  const whereInbox = inbox_id ? `WHERE c.inbox_id = ${Number(inbox_id)}` : '';

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_conversations,
      SUM(CASE WHEN c.status != 'Closed' THEN 1 ELSE 0 END) as active_conversations,
      SUM(CASE WHEN c.status = 'Open' THEN 1 ELSE 0 END) as open_conversations,
      SUM(CASE WHEN c.status = 'Pending' THEN 1 ELSE 0 END) as pending_conversations,
      SUM(CASE WHEN c.status = 'Closed' THEN 1 ELSE 0 END) as resolved_conversations,
      AVG(CASE WHEN c.first_responded_at IS NOT NULL THEN (julianday(c.first_responded_at) - julianday(c.created_at)) * 1440 ELSE NULL END) as avg_first_response_mins,
      AVG(CASE WHEN c.first_assigned_at IS NOT NULL THEN (julianday(c.first_assigned_at) - julianday(c.created_at)) * 1440 ELSE NULL END) as avg_first_assign_mins,
      AVG(CASE WHEN c.resolved_at IS NOT NULL THEN (julianday(c.resolved_at) - julianday(c.created_at)) * 1440 ELSE NULL END) as avg_resolution_mins
    FROM conversations c
    ${whereInbox}
  `).get();

  // Last 7 days daily series
  const dailySeries = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const isoDay = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

    const dayStats = db.prepare(`
      SELECT
        COUNT(*) as new_count,
        SUM(CASE WHEN status != 'Closed' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as resolved_count
      FROM conversations c
      WHERE substr(c.created_at, 1, 10) = ?
      ${inbox_id ? `AND c.inbox_id = ${Number(inbox_id)}` : ''}
    `).get(isoDay);

    dailySeries.push({
      date: isoDay,
      label,
      active: dayStats.active_count || 0,
      new: dayStats.new_count || 0,
      resolved: dayStats.resolved_count || 0,
    });
  }

  // Users breakdown
  const userMetrics = db.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.status,
      COUNT(c.id) as assigned_total,
      SUM(CASE WHEN c.status != 'Closed' THEN 1 ELSE 0 END) as active_assigned,
      SUM(CASE WHEN c.status = 'Closed' THEN 1 ELSE 0 END) as resolved_assigned
    FROM users u
    LEFT JOIN conversations c ON c.assignee_id = u.id ${inbox_id ? `AND c.inbox_id = ${Number(inbox_id)}` : ''}
    GROUP BY u.id
    ORDER BY assigned_total DESC
  `).all();

  // Tags breakdown
  const tagMetrics = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.color,
      COUNT(ct.conversation_id) as count
    FROM tags t
    LEFT JOIN conversation_tags ct ON ct.tag_id = t.id
    LEFT JOIN conversations c ON c.id = ct.conversation_id
    ${inbox_id ? `WHERE c.inbox_id = ${Number(inbox_id)} OR c.id IS NULL` : ''}
    GROUP BY t.id
    ORDER BY count DESC
  `).all();

  // Contacts breakdown
  const contactMetrics = db.prepare(`
    SELECT
      c.customer_name,
      c.customer_email,
      COUNT(*) as total_conversations,
      SUM(CASE WHEN c.status != 'Closed' THEN 1 ELSE 0 END) as active_conversations,
      MAX(c.created_at) as last_contacted_at
    FROM conversations c
    ${whereInbox}
    GROUP BY c.customer_email
    ORDER BY total_conversations DESC
  `).all();

  // Per-inbox summary for Custom Dashboards
  const inboxSummaries = db.prepare('SELECT * FROM shared_inboxes ORDER BY id ASC').all().map(ib => {
    const st = db.prepare(`
      SELECT
        COUNT(*) as new_conversations,
        SUM(CASE WHEN status != 'Closed' THEN 1 ELSE 0 END) as active_conversations,
        SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as resolved_conversations
      FROM conversations WHERE inbox_id = ?
    `).get(ib.id);
    return {
      inbox_id: ib.id,
      inbox_name: ib.name,
      new_conversations: st.new_conversations || 0,
      active_conversations: st.active_conversations || 0,
      resolved_conversations: st.resolved_conversations || 0,
    };
  });

  res.json({
    totals: {
      total_conversations: totals.total_conversations || 0,
      active_conversations: totals.active_conversations || 0,
      open_conversations: totals.open_conversations || 0,
      pending_conversations: totals.pending_conversations || 0,
      resolved_conversations: totals.resolved_conversations || 0,
      avg_first_response_mins: totals.avg_first_response_mins ? Math.round(totals.avg_first_response_mins) : 0,
      avg_first_assign_mins: totals.avg_first_assign_mins ? Math.round(totals.avg_first_assign_mins) : 0,
      avg_resolution_mins: totals.avg_resolution_mins ? Math.round(totals.avg_resolution_mins) : 0,
    },
    dailySeries,
    userMetrics,
    tagMetrics,
    contactMetrics,
    inboxSummaries,
  });
});

// Custom Dashboards (Screenshot 000510.png & 000518.png)
app.post('/api/dashboards', (req, res) => {
  const { name, created_by = 'Admin', widgets = [] } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Dashboard name is required' });

  // Default widgets showing inbox cards if none supplied
  let finalWidgets = widgets;
  if (!Array.isArray(finalWidgets) || finalWidgets.length === 0) {
    const inboxes = db.prepare('SELECT * FROM shared_inboxes ORDER BY id ASC').all();
    finalWidgets = inboxes.flatMap(ib => [
      { id: `w_new_${ib.id}`, inbox_id: ib.id, inbox_name: ib.name, metric: 'New conversations' },
      { id: `w_act_${ib.id}`, inbox_id: ib.id, inbox_name: ib.name, metric: 'Active conversations' },
    ]);
  }

  const info = db.prepare(`
    INSERT INTO custom_dashboards (name, created_by, widgets_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(name.trim().slice(0, 65), created_by, JSON.stringify(finalWidgets));

  const row = db.prepare('SELECT * FROM custom_dashboards WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ...row, widgets: JSON.parse(row.widgets_json || '[]') });
});

app.patch('/api/dashboards/:id', (req, res) => {
  const { name, widgets, created_by } = req.body;
  const row = db.prepare('SELECT * FROM custom_dashboards WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Dashboard not found' });

  db.prepare(`
    UPDATE custom_dashboards
    SET name = COALESCE(?, name),
        widgets_json = COALESCE(?, widgets_json),
        created_by = COALESCE(?, created_by),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ? name.trim().slice(0, 65) : null,
    widgets ? JSON.stringify(widgets) : null,
    created_by ?? null,
    row.id
  );

  const updated = db.prepare('SELECT * FROM custom_dashboards WHERE id = ?').get(row.id);
  res.json({ ...updated, widgets: JSON.parse(updated.widgets_json || '[]') });
});

app.delete('/api/dashboards/:id', (req, res) => {
  db.prepare('DELETE FROM custom_dashboards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Custom Reports & Scheduled Exports (Screenshot 000525.png)
app.post('/api/reports', (req, res) => {
  const {
    name,
    metric = 'Active conversations',
    inbox_id = null,
    date_range = 'Last 7 days',
    columns = ['conversation_code', 'subject', 'customer_email', 'status', 'assignee_name', 'created_at'],
    schedule_frequency = '',
    recipient_email = '',
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Report name is required' });

  const info = db.prepare(`
    INSERT INTO custom_reports (name, metric, inbox_id, date_range, columns_json, schedule_frequency, recipient_email)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), metric, inbox_id || null, date_range, JSON.stringify(columns), schedule_frequency, recipient_email);

  const row = db.prepare('SELECT * FROM custom_reports WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ...row, columns: JSON.parse(row.columns_json || '[]') });
});

app.delete('/api/reports/:id', (req, res) => {
  db.prepare('DELETE FROM custom_reports WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/exports/csv', (req, res) => {
  const { inbox_id, metric = 'Active conversations', status } = req.query;
  let sql = `
    SELECT c.conversation_code, c.subject, c.customer_name, c.customer_email,
           c.status, c.priority, COALESCE(u.name, 'Unassigned') as assignee_name,
           COALESCE(i.name, '') as inbox_name, c.sla_policy_name, c.created_at, c.updated_at
    FROM conversations c
    LEFT JOIN users u ON u.id = c.assignee_id
    LEFT JOIN shared_inboxes i ON i.id = c.inbox_id
    WHERE 1=1
  `;
  const params = [];
  if (inbox_id) {
    sql += ' AND c.inbox_id = ?';
    params.push(Number(inbox_id));
  }
  if (metric === 'Active conversations') {
    sql += " AND c.status != 'Closed'";
  } else if (metric === 'Resolved conversations') {
    sql += " AND c.status = 'Closed'";
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY c.id DESC';

  const rows = db.prepare(sql).all(...params);
  const headers = [
    'Conversation ID',
    'Subject',
    'Customer Name',
    'Customer Email',
    'Status',
    'Priority',
    'Assignee',
    'Shared Inbox',
    'SLA Policy',
    'Created At',
    'Updated At',
  ];

  const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const csvLines = [
    headers.join(','),
    ...rows.map(r => [
      escapeCsv(r.conversation_code),
      escapeCsv(r.subject),
      escapeCsv(r.customer_name),
      escapeCsv(r.customer_email),
      escapeCsv(r.status),
      escapeCsv(r.priority),
      escapeCsv(r.assignee_name),
      escapeCsv(r.inbox_name),
      escapeCsv(r.sla_policy_name),
      escapeCsv(r.created_at),
      escapeCsv(r.updated_at),
    ].join(',')),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="threadly-export.csv"');
  res.send(csvLines.join('\n'));
});

// Google OAuth 2.0 Endpoints
app.get('/api/auth/google/url', (req, res) => {
  const { isConfigured, clientId, redirectUri } = getOAuthConfig();
  const url = getAuthUrl(req.query.state || 'threadly_dashboard');
  res.json({
    isConfigured,
    url,
    clientIdSnippet: clientId ? `${clientId.slice(0, 14)}...` : '',
    redirectUri,
  });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.redirect(`http://localhost:5173/?auth_error=${encodeURIComponent(String(error))}`);
  }
  if (!code) {
    return res.status(400).send('Authorization code missing');
  }
  try {
    const account = await exchangeCodeForTokens(String(code));
    // Trigger initial background sync
    syncGmailViaOAuth(account.email, 25).then(() => {
      io.emit('conversation_created', {});
    }).catch(() => {});

    io.emit('oauth_connected', account);
    const userRow = db.prepare('SELECT id, name, email FROM users WHERE LOWER(email) = ?').get(account.email.toLowerCase());
    res.redirect(`http://localhost:5173/?auth_success=1&user_id=${userRow ? userRow.id : ''}&email=${encodeURIComponent(account.email)}`);
  } catch (err) {
    res.redirect(`http://localhost:5173/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || typeof email !== 'string' || !name.trim() || !email.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  if (typeof password !== 'string' || password.length < 10 || password.length > 1024) {
    return res.status(400).json({ error: 'Password must be at least 10 characters.' });
  }
  const cleanEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
  }
  const pwdHash = await hashPassword(password);
  const userRes = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, status)
    VALUES (?, ?, ?, 'Admin', 'Active')
  `).run(name.trim(), cleanEmail, pwdHash);
  const userId = userRes.lastInsertRowid;
  const user = db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').get(userId);

  // Ensure a personal shared inbox exists for the user
  const existingInbox = db.prepare('SELECT id FROM shared_inboxes WHERE LOWER(email) = ?').get(cleanEmail);
  let inboxId = existingInbox?.id;
  if (!inboxId) {
    const inboxRes = db.prepare(`
      INSERT INTO shared_inboxes (name, email, channel_type, auto_assign_mode, csat_enabled)
      VALUES (?, ?, 'email', 'round_robin', 1)
    `).run(`${name.trim()}'s Inbox`, cleanEmail);
    inboxId = inboxRes.lastInsertRowid;
  }
  db.prepare('INSERT OR IGNORE INTO inbox_members (inbox_id, user_id) VALUES (?, ?)').run(inboxId, userId);

  const sessionToken = createSession(userId);
  io.emit('setup_updated', getSetupProgress());
  res.json({ ok: true, user, token: sessionToken });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);

    // Same work and same response whether the account exists or not (no user enumeration).
    let authenticated = false;
    if (user) {
      authenticated = await verifyPassword(password, user.password_hash);
    } else {
      await verifyAgainstDummy(password);
    }
    if (!authenticated) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Upgrade legacy single-round SHA-256 hashes (or weaker scrypt params) on successful login.
    if (needsRehash(user.password_hash)) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id);
    }

    const sessionToken = createSession(user.id);
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
    res.json({ ok: true, user: safeUser, token: sessionToken });
  } catch (err) {
    next(err);
  }
});

app.get('/api/auth/me', (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

app.get('/api/auth/google/status', (req, res) => {
  const config = getOAuthConfig();
  const account = getConnectedAccount();
  res.json({
    isConfigured: config.isConfigured,
    redirectUri: config.redirectUri,
    connected: Boolean(account),
    account: account
      ? {
          email: account.email,
          name: account.name,
          avatarUrl: account.avatar_url,
          updatedAt: account.updated_at,
        }
      : null,
  });
});

app.post('/api/auth/google/sync', async (req, res) => {
  try {
    const account = getConnectedAccount();
    if (!account?.email) {
      return res.status(400).json({ error: 'No Google account connected via OAuth 2.0.' });
    }
    const limit = Number(req.body?.limit) || 30;
    const result = await syncGmailViaOAuth(account.email, limit);
    io.emit('conversation_created', {});
    io.emit('setup_updated', getSetupProgress());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Google OAuth sync failed' });
  }
});

app.post('/api/auth/google/disconnect', (req, res) => {
  disconnectGoogle();
  io.emit('oauth_disconnected', {});
  res.json({ ok: true });
});

app.post('/api/auth/google/demo-login', (req, res) => {
  const account = simulateDemoLogin(req.body?.email || 'admin@threadly.io', req.body?.name || 'Alex Rivera');
  io.emit('oauth_connected', account);
  res.json({ ok: true, account });
});

app.get('/api/gmail/status', (req, res) => {
  const oauthAccount = getConnectedAccount();
  const receivedCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE is_agent_reply = 0').get().c;
  const sentCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE is_agent_reply = 1').get().c;
  res.json({
    oauthConnected: Boolean(oauthAccount),
    connectedEmail: oauthAccount?.email || 'Not connected',
    connectedName: oauthAccount?.name || '',
    receivedCount,
    sentCount,
  });
});

app.post('/api/gmail/sync', async (req, res) => {
  try {
    const oauthAccount = getConnectedAccount();
    if (oauthAccount?.email) {
      const result = await syncGmailViaOAuth(oauthAccount.email, Number(req.body?.limit) || 30);
      io.emit('conversation_created', {});
      io.emit('setup_updated', getSetupProgress());
      return res.json(result);
    }
    return res.status(400).json({
      error: 'Please connect your Google Account via OAuth 2.0 or use the Threadly Chrome Extension for automatic tab sync.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Gmail sync failed' });
  }
});

app.post('/api/gmail/extension-bulk-sync', (req, res) => {
  const {
    ownerEmail,
    account_email,
    items,
    emails,
  } = req.body || {};
  const oauthAccount = getConnectedAccount();
  const result = bulkSyncFromExtension({
    ownerEmail: ownerEmail || account_email || oauthAccount?.email || 'admin@threadly.io',
    items: items || emails || [],
  });
  if (result.syncedCount > 0) {
    io.emit('conversation_created', {});
  }
  res.json(result);
});

app.post('/api/seed', (req, res) => {
  seedWorkspaceData();
  io.emit('setup_updated', getSetupProgress());
  res.json({ ok: true });
});

// Database operates purely on real user data (no automatic mock data)

// Background sync every 60 seconds when OAuth is connected
function startBackgroundSync() {
  return setInterval(async () => {
    try {
      const account = getConnectedAccount();
      if (account?.email) {
        await syncGmailViaOAuth(account.email, 15);
        io.emit('conversation_created', {});
      }
    } catch (err) {
      console.warn('Background Gmail sync failed:', err.message);
    }
  }, 60000);
}

const path = require('node:path');
const fs = require('node:fs');

// In production, serve the compiled dashboard build
const dashboardDist = path.join(__dirname, '../../dashboard/dist');
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });
}

// Only bind a port when run directly (`node src/server.js`); tests import { app } instead.
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => {
    console.log(`Threadly Unified Backend & Socket.io Server running on http://localhost:${PORT}`);
  });
  startBackgroundSync();
}

module.exports = { app, server, io };

