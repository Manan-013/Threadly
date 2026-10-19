const defaultBase = 'http://localhost:4000';
const inputEl = document.getElementById('server-url-input');

chrome.storage.sync.get(['threadly_api_base'], (cfg) => {
  const currentBase = cfg.threadly_api_base || defaultBase;
  if (inputEl) inputEl.value = currentBase;
  checkHealth(currentBase);
});

document.getElementById('save-server-btn')?.addEventListener('click', () => {
  const val = (inputEl.value || defaultBase).trim().replace(/\/$/, '');
  chrome.storage.sync.set({ threadly_api_base: val }, () => {
    checkHealth(val);
  });
});

document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.storage.sync.get(['threadly_api_base'], (cfg) => {
    const base = cfg.threadly_api_base || defaultBase;
    chrome.tabs.create({ url: base });
  });
});

function checkHealth(base) {
  fetch(`${base}/api/bootstrap`)
    .then(r => r.json())
    .then(data => {
      document.getElementById('server-status').textContent = 'Connected';
      document.getElementById('server-status').style.color = '#059669';
      document.getElementById('setup-summary').textContent = `Workspace Setup: ${
        data.setup?.completedCount || 0
      }/5 done • ${data.inboxes?.length || 0} Shared Inboxes`;
    })
    .catch(() => {
      const st = document.getElementById('server-status');
      st.textContent = 'Offline';
      st.style.color = '#DC2626';
      document.getElementById('setup-summary').textContent =
        `Cannot reach ${base}. Check server status.`;
    });
}

