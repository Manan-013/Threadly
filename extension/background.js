const API_BASE = 'http://localhost:4000';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'THREADLY_API') {
    const { path, method = 'GET', body } = message;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    fetch(`${API_BASE}${path}`, options)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch(err => {
        sendResponse({ ok: false, error: String(err) });
      });

    return true; // Keep message channel open for async response
  }

  if (message && message.type === 'OPEN_TAB') {
    const url = message.url || 'http://localhost:5173';
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return true;
  }
});

