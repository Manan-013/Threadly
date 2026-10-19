const defaultBase = 'http://localhost:4000';
const $ = id => document.getElementById(id);

const send = message => new Promise(resolve => chrome.runtime.sendMessage(message, resolve));

function setStatus(text, color) {
  const el = $('server-status');
  el.textContent = text;
  el.style.color = color;
}

async function refresh() {
  const status = await send({ type: 'THREADLY_STATUS' });
  const signedIn = Boolean(status && status.user);
  $('login-card').style.display = status && status.reachable && !signedIn ? 'block' : 'none';
  $('account-card').style.display = signedIn ? 'block' : 'none';

  if (!status || !status.reachable) {
    setStatus('Offline', '#DC2626');
    $('setup-summary').textContent = 'Cannot reach the Threadly server. Check the URL below.';
    return;
  }
  setStatus(signedIn ? 'Connected' : 'Sign in', signedIn ? '#059669' : '#B45309');
  if (signedIn) {
    $('account-name').textContent = `${status.user.name} (${status.user.role})`;
    const boot = await send({ type: 'THREADLY_API', path: '/api/bootstrap' });
    $('setup-summary').textContent = boot && boot.ok
      ? `Workspace Setup: ${boot.data.setup?.completedCount || 0}/5 done • ${boot.data.inboxes?.length || 0} Shared Inboxes`
      : 'Signed in.';
  } else {
    $('setup-summary').textContent = 'Sign in to use Threadly inside Gmail.';
  }
}

chrome.storage.sync.get(['threadly_api_base'], cfg => {
  $('server-url-input').value = cfg.threadly_api_base || defaultBase;
  refresh();
});

$('save-server-btn').addEventListener('click', () => {
  const val = ($('server-url-input').value || defaultBase).trim().replace(/\/$/, '');
  chrome.storage.sync.set({ threadly_api_base: val }, refresh);
});

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('login-error').textContent = '';
  const result = await send({
    type: 'THREADLY_LOGIN',
    email: $('login-email').value.trim(),
    password: $('login-password').value,
  });
  $('login-password').value = '';
  if (!result || !result.ok) {
    $('login-error').textContent = (result && result.error) || 'Sign-in failed';
    return;
  }
  refresh();
});

$('logout-btn').addEventListener('click', async () => {
  await send({ type: 'THREADLY_LOGOUT' });
  refresh();
});

$('open-dashboard').addEventListener('click', () => {
  chrome.storage.sync.get(['threadly_api_base'], cfg => {
    chrome.tabs.create({ url: cfg.threadly_api_base || defaultBase });
  });
});
