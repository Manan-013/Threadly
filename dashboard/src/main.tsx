import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Automatically attach active session token to all dashboard API requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  const token = localStorage.getItem('threadly_auth_token');
  const userId = localStorage.getItem('threadly_active_user_id');
  
  if (typeof resource === 'string' && resource.startsWith('/api')) {
    config = config || {};
    const headers = new Headers(config.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (userId && !headers.has('x-user-id')) {
      headers.set('x-user-id', userId);
    }
    config.headers = headers;
  }
  return originalFetch(resource, config);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

