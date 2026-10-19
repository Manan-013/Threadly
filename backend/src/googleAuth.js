const { db } = require('./db');
const { upsertEmailIntoThreadly } = require('./gmailSync');

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';
  return { clientId, clientSecret, redirectUri, isConfigured: Boolean(clientId && clientSecret) };
}

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

function getAuthUrl(state = 'threadly_dashboard') {
  const { clientId, redirectUri, isConfigured } = getOAuthConfig();
  if (!isConfigured) {
    return null;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error) {
    throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange authorization code');
  }

  // Fetch Google User Profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();
  if (!profile.email) {
    throw new Error('Failed to retrieve user profile from Google');
  }

  const email = profile.email.toLowerCase();
  const name = profile.name || email.split('@')[0];
  const avatarUrl = profile.picture || '';
  const expiresIn = tokenData.expires_in || 3600;
  const expiresAt = Date.now() + expiresIn * 1000;
  const scopes = tokenData.scope || SCOPES.join(' ');

  // Save to oauth_accounts
  const existing = db.prepare('SELECT * FROM oauth_accounts WHERE email = ?').get(email);
  if (existing) {
    const finalRefreshToken = tokenData.refresh_token || existing.refresh_token;
    db.prepare(`
      UPDATE oauth_accounts
      SET name = ?, avatar_url = ?, access_token = ?, refresh_token = ?, expires_at = ?, scopes = ?, updated_at = datetime('now')
      WHERE email = ?
    `).run(name, avatarUrl, tokenData.access_token, finalRefreshToken, expiresAt, scopes, email);
  } else {
    db.prepare(`
      INSERT INTO oauth_accounts (provider, email, name, avatar_url, access_token, refresh_token, expires_at, scopes)
      VALUES ('google', ?, ?, ?, ?, ?, ?, ?)
    `).run(email, name, avatarUrl, tokenData.access_token, tokenData.refresh_token || null, expiresAt, scopes);
  }

  // Link in workspace_settings
  db.prepare(`
    INSERT INTO workspace_settings (key, value, updated_at)
    VALUES ('google_oauth_connected_email', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(email);

  // Ensure user is created in users table
  const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
  let userId;
  if (!existingUser) {
    const uRes = db.prepare(`
      INSERT INTO users (name, email, role, status)
      VALUES (?, ?, 'Admin', 'Active')
    `).run(name, email);
    userId = uRes.lastInsertRowid;
  } else {
    userId = existingUser.id;
  }

  // Ensure user's shared inbox exists
  const existingInbox = db.prepare('SELECT id FROM shared_inboxes WHERE LOWER(email) = ?').get(email);
  let inboxId = existingInbox?.id;
  if (!inboxId) {
    const ibRes = db.prepare(`
      INSERT INTO shared_inboxes (name, email, channel_type, auto_assign_mode, csat_enabled)
      VALUES (?, ?, 'email', 'round_robin', 1)
    `).run(`${name}'s Inbox`, email);
    inboxId = ibRes.lastInsertRowid;
  }
  db.prepare('INSERT OR IGNORE INTO inbox_members (inbox_id, user_id) VALUES (?, ?)').run(inboxId, userId);

  return { id: userId, email, name, avatarUrl };
}

function getConnectedAccount() {
  const setting = db.prepare("SELECT value FROM workspace_settings WHERE key = 'google_oauth_connected_email'").get();
  const email = setting?.value;
  if (!email) {
    // Check if any account exists
    const row = db.prepare('SELECT email, name, avatar_url, scopes, updated_at FROM oauth_accounts ORDER BY id DESC LIMIT 1').get();
    return row || null;
  }
  const row = db.prepare('SELECT email, name, avatar_url, scopes, updated_at FROM oauth_accounts WHERE email = ?').get(email);
  return row || null;
}

async function getValidAccessToken(accountEmail) {
  const targetEmail = accountEmail || getConnectedAccount()?.email;
  if (!targetEmail) return null;

  const row = db.prepare('SELECT * FROM oauth_accounts WHERE email = ?').get(targetEmail);
  if (!row) return null;

  // Check if current access token is valid (with 60s buffer)
  if (row.access_token && row.expires_at && Date.now() < row.expires_at - 60000) {
    return row.access_token;
  }

  // Refresh token if available
  if (!row.refresh_token) {
    return row.access_token || null;
  }

  const { clientId, clientSecret } = getOAuthConfig();
  if (!clientId || !clientSecret) return row.access_token || null;

  try {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const refreshData = await refreshRes.json();
    if (refreshRes.ok && refreshData.access_token) {
      const expiresIn = refreshData.expires_in || 3600;
      const expiresAt = Date.now() + expiresIn * 1000;
      db.prepare(`
        UPDATE oauth_accounts
        SET access_token = ?, expires_at = ?, updated_at = datetime('now')
        WHERE email = ?
      `).run(refreshData.access_token, expiresAt, targetEmail);
      return refreshData.access_token;
    }
  } catch (err) {
    console.error('Failed to auto-refresh Google access token:', err.message);
  }

  return row.access_token || null;
}

async function syncGmailViaOAuth(email, maxResults = 30) {
  const accessToken = await getValidAccessToken(email);
  if (!accessToken) {
    throw new Error('Google OAuth is not connected or token expired. Please connect your Google account.');
  }

  // Resolve target inbox
  const defaultInbox = db.prepare('SELECT id FROM shared_inboxes LIMIT 1').get() || { id: 1 };
  const targetInboxId = defaultInbox.id;

  // 1. Fetch message list from Gmail REST API
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(maxResults, 50)}`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const errData = await listRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gmail API returned ${listRes.status}`);
  }

  const listData = await listRes.json();
  const messages = listData.messages || [];
  let syncedCount = 0;

  for (const m of messages) {
    try {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!detailRes.ok) continue;

      const detail = await detailRes.json();
      const headers = detail.payload?.headers || [];
      const getHeader = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('subject') || '(No Subject)';
      const fromRaw = getHeader('from') || '';
      const toRaw = getHeader('to') || '';
      const dateRaw = getHeader('date') || '';

      // Parse from
      let fromName = fromRaw;
      let fromEmail = fromRaw;
      const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
      if (fromMatch) {
        fromName = fromMatch[1].replace(/^["']|["']$/g, '').trim();
        fromEmail = fromMatch[2].trim();
      }

      // Parse to
      let toEmail = toRaw;
      const toMatch = toRaw.match(/<(.+?)>/);
      if (toMatch) {
        toEmail = toMatch[1].trim();
      }

      // Extract body snippet or decoded body
      let body = detail.snippet || '';
      const parts = detail.payload?.parts || [];
      const textPart = parts.find(p => p.mimeType === 'text/plain') || detail.payload;
      if (textPart?.body?.data) {
        try {
          body = Buffer.from(textPart.body.data, 'base64url').toString('utf8');
        } catch (_) {}
      }

      const isSentByMe = Boolean(email && fromEmail.toLowerCase() === email.toLowerCase());
      const dateIso = dateRaw ? new Date(dateRaw).toISOString() : new Date(Number(detail.internalDate) || Date.now()).toISOString();

      upsertEmailIntoThreadly({
        externalId: detail.threadId || m.id,
        inboxId: targetInboxId,
        subject,
        fromName,
        fromEmail,
        toEmail,
        body: body.slice(0, 4000),
        dateIso,
        isSentByMe,
      });
      syncedCount++;
    } catch (_) {
      // Continue next message
    }
  }

  return { success: true, syncedCount, email };
}

async function sendGmailViaOAuth({ email, to, subject, body, inReplyTo, threadId }) {
  const accessToken = await getValidAccessToken(email);
  if (!accessToken) {
    throw new Error('Google OAuth is not connected. Cannot send email.');
  }

  const lines = [
    `From: ${email}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    lines.push(`References: ${inReplyTo}`);
  }
  lines.push('');
  lines.push(body);

  const raw = Buffer.from(lines.join('\r\n')).toString('base64url');

  const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw,
      threadId: threadId || undefined,
    }),
  });

  const sendData = await sendRes.json();
  if (!sendRes.ok || sendData.error) {
    throw new Error(sendData.error?.message || 'Failed to send message via Gmail API');
  }

  return sendData;
}

function disconnectGoogle() {
  const connected = getConnectedAccount();
  db.prepare("DELETE FROM workspace_settings WHERE key = 'google_oauth_connected_email'").run();
  if (connected?.email) {
    db.prepare('DELETE FROM oauth_accounts WHERE email = ?').run(connected.email);
  }
  return { ok: true };
}

function simulateDemoLogin(email = 'admin@threadly.io', name = 'Alex Rivera') {
  const avatarUrl = '';
  const expiresAt = Date.now() + 86400 * 1000;
  const scopes = SCOPES.join(' ');
  const existing = db.prepare('SELECT id FROM oauth_accounts WHERE email = ?').get(email);
  if (existing) {
    db.prepare(`
      UPDATE oauth_accounts
      SET name = ?, access_token = 'demo_token', expires_at = ?, updated_at = datetime('now')
      WHERE email = ?
    `).run(name, expiresAt, email);
  } else {
    db.prepare(`
      INSERT INTO oauth_accounts (provider, email, name, avatar_url, access_token, refresh_token, expires_at, scopes)
      VALUES ('google', ?, ?, ?, 'demo_token', 'demo_refresh', ?, ?)
    `).run(email, name, avatarUrl, expiresAt, scopes);
  }

  db.prepare(`
    INSERT INTO workspace_settings (key, value, updated_at)
    VALUES ('google_oauth_connected_email', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(email);

  return { email, name, avatarUrl };
}

module.exports = {
  getOAuthConfig,
  getAuthUrl,
  exchangeCodeForTokens,
  getConnectedAccount,
  getValidAccessToken,
  syncGmailViaOAuth,
  sendGmailViaOAuth,
  disconnectGoogle,
  simulateDemoLogin,
};
