const DEFAULT_API_BASE = 'http://localhost:4000';

// All network access to the Threadly server happens here, in the service worker. Content scripts
// (which run inside Gmail) only send messages; they never see the session token.

function getConfig() {
  return Promise.all([
    chrome.storage.sync.get(['threadly_api_base']),
    // Session token lives in local storage on purpose: `sync` would copy it to the user's Google account.
    chrome.storage.local.get(['threadly_token']),
  ]).then(([sync, local]) => ({
    apiBase: (sync.threadly_api_base || DEFAULT_API_BASE).replace(/\/$/, ''),
    token: local.threadly_token || '',
  }));
}

async function callApi({ path, method = 'GET', body, auth = true }) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    return { ok: false, status: 0, error: 'Invalid API path' };
  }
  const { apiBase, token } = await getConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const options = { method, headers };
  if (body !== undefined && body !== null && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${apiBase}${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && auth && token) {
      await chrome.storage.local.remove('threadly_token'); // expired or revoked: force a fresh sign-in
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

async function handleMessage(message) {
  switch (message && message.type) {
    case 'THREADLY_API':
      return callApi(message);

    case 'THREADLY_LOGIN': {
      const result = await callApi({
        path: '/api/auth/login',
        method: 'POST',
        body: { email: message.email, password: message.password },
        auth: false,
      });
      if (result.ok && result.data && result.data.token) {
        await chrome.storage.local.set({ threadly_token: result.data.token });
        return { ok: true, status: result.status, data: { user: result.data.user } };
      }
      return { ok: false, status: result.status, error: (result.data && result.data.error) || result.error || 'Sign-in failed' };
    }

    case 'THREADLY_LOGOUT': {
      await callApi({ path: '/api/auth/logout', method: 'POST' });
      await chrome.storage.local.remove('threadly_token');
      return { ok: true };
    }

    case 'THREADLY_STATUS': {
      const health = await callApi({ path: '/api/health', auth: false });
      if (!health.ok) return { ok: false, reachable: false };
      const me = await callApi({ path: '/api/auth/me' });
      return { ok: true, reachable: true, user: me.ok ? me.data.user : null };
    }

    case 'OPEN_TAB': {
      const { apiBase } = await getConfig();
      await chrome.tabs.create({ url: message.url || apiBase });
      return { ok: true };
    }

    default:
      return { ok: false, error: 'Unknown message type' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension's own pages and its Gmail content script may use the bridge.
  if (sender.id !== chrome.runtime.id) return false;
  handleMessage(message).then(sendResponse, err => sendResponse({ ok: false, error: String(err) }));
  return true; // keep the channel open for the async response
});
