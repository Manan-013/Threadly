document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:5173' });
});

fetch('http://localhost:4000/api/bootstrap')
  .then(r => r.json())
  .then(data => {
    document.getElementById('server-status').textContent = 'Connected';
    document.getElementById('setup-summary').textContent = `Workspace Setup: ${
      data.setup?.completedCount || 0
    }/5 done • ${data.inboxes?.length || 0} Shared Inboxes`;
  })
  .catch(() => {
    const st = document.getElementById('server-status');
    st.textContent = 'Offline';
    st.style.color = '#DC2626';
    document.getElementById('setup-summary').textContent =
      'Start the backend server on port 4000 to sync.';
  });
