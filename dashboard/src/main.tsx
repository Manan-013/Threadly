import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Attach the session token to every API call, and surface expired/revoked sessions (401) to the app.
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const [resource, init] = args;
  const isApiCall = typeof resource === 'string' && resource.startsWith('/api');
  if (!isApiCall) return originalFetch(resource, init);

  const token = localStorage.getItem('threadly_auth_token');
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await originalFetch(resource, { ...init, headers });

  const isCredentialCheck = resource === '/api/auth/login' || resource === '/api/auth/register';
  if (response.status === 401 && token && !isCredentialCheck) {
    localStorage.removeItem('threadly_auth_token');
    window.dispatchEvent(new Event('threadly:unauthorized'));
  }
  return response;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

