(function () {
  const DASHBOARD_URL = 'http://localhost:5173';

  function detectActiveGmailUser() {
    const profileEl = document.querySelector('a[aria-label*="@"]');
    if (profileEl) {
      const match = profileEl.getAttribute('aria-label')?.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (match) return match[0];
    }
    const accountEl = document.querySelector('.gb_d[aria-label*="@"]');
    if (accountEl) {
      const match = accountEl.getAttribute('aria-label')?.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (match) return match[0];
    }
    return 'user@example.com';
  }

  let bootstrap = {
    setup: { completedCount: 3, totalCount: 5 },
    users: [
      { id: 1, name: 'Support Admin', email: 'admin@threadly.io', role: 'Admin' },
      { id: 2, name: 'Support Teammate', email: 'teammate@threadly.io', role: 'Agent' },
    ],
    inboxes: [
      {
        id: 1,
        name: 'Main Shared Inbox',
        email: 'inbox@threadly.io',
        counts: { total: 0, unassigned: 0, open: 0, pending: 0, closed: 0 },
      },
    ],
    tags: [],
    templates: [],
  };

  let activeUserEmail = 'user@example.com';
  let activeConversation = null;
  let lastSyncedSubject = '';
  let activityFilter = 'all';
  let activeLeftView = 'open';

  function apiCall(path, method = 'GET', body = null) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'THREADLY_API', path, method, body }, resp => {
          if (resp && resp.ok) resolve(resp.data);
          else resolve(null);
        });
      } else {
        resolve(null);
      }
    });
  }

  function detectLoggedInGmailUser() {
    const titleEl = document.querySelector('a[aria-label*="Google Account:"][aria-label*="@"]');
    if (titleEl) {
      const label = titleEl.getAttribute('aria-label') || '';
      const match = label.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (match && match[1]) {
        activeUserEmail = match[1].toLowerCase();
      }
    }
  }

  function getActiveActorName() {
    const found = (bootstrap.users || []).find(
      u => u.email.toLowerCase() === activeUserEmail.toLowerCase()
    );
    return found ? found.name : activeUserEmail;
  }

  async function refreshBootstrap() {
    detectLoggedInGmailUser();
    const data = await apiCall('/api/bootstrap', 'GET');
    if (data && data.users) {
      bootstrap = data;
    }
    if (!activeConversation) {
      const convList = await apiCall('/api/conversations', 'GET');
      if (Array.isArray(convList) && convList.length > 0) {
        const full = await apiCall(`/api/conversations/${convList[0].id}`, 'GET');
        if (full) activeConversation = full;
      }
    }
    injectLeftSidebar();
    renderTopWidget();
    renderSidebar();
  }

  // ---------------------------------------------------------------------------
  // 1. INJECT THREADLY SHARED INBOXES INTO GMAIL'S LEFT SIDEBAR (FULL PRODUCTION VERSION)
  // ---------------------------------------------------------------------------
  let expandedInboxes = {}; // { [inboxId]: boolean }
  let activeSlideoverMode = null; // 'team' | 'all_views' | 'tags' | null
  let activeSlideoverInboxId = null;

  function getActiveUserObj() {
    const found = (bootstrap.users || []).find(
      u => u.email.toLowerCase() === activeUserEmail.toLowerCase()
    );
    return found || (bootstrap.users && bootstrap.users[0]) || null;
  }

  function injectLeftSidebar() {
    const primaryTk =
      document.querySelector('.wT .byl .TK') ||
      document.querySelector('.wT .TK') ||
      document.querySelector('div[role="navigation"] .TK');

    if (!primaryTk) return;

    let container = document.getElementById('threadly-left-nav-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'threadly-left-nav-container';
      container.className = 'threadly-ext-root';
      primaryTk.insertAdjacentElement('afterend', container);
    } else if (container.previousElementSibling !== primaryTk) {
      primaryTk.insertAdjacentElement('afterend', container);
    }

    const emailInboxes = (bootstrap.inboxes || []).filter(
      ib => (!ib.channel_type || ib.channel_type === 'email') && ib.name !== 'Demo Inbox'
    );

    const inboxes =
      emailInboxes.length > 0
        ? emailInboxes
        : [
            {
              id: 1,
              name: 'Team Inbox',
              email: 'team@threadly.io',
              counts: { total: 0, unassigned: 0, open: 0, pending: 0, closed: 0, by_user: {} },
            },
          ];

    // Keep inboxes collapsed by default so Gmail's sidebar is never crowded
    inboxes.forEach(ib => {
      if (expandedInboxes[ib.id] === undefined) {
        expandedInboxes[ib.id] = false;
      }
    });

    const currentUser = getActiveUserObj();
    const assignedToMeCount = currentUser?.assigned_count || 0;
    const followingCount = currentUser?.following_count || 0;

    // Two-tone SVG icons in Enterprise Crimson (#FCA5A5 / #DC2626)
    const iconAssignedToMe = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="4" fill="#FFFFFF"/>
        <path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5Z" fill="#FCA5A5" stroke="#202124"/>
      </svg>`;

    const iconFollowing = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" fill="#FFFFFF"/>
        <circle cx="12" cy="12" r="3" fill="#FCA5A5" stroke="#202124"/>
      </svg>`;

    const iconSharedInbox = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 5h16l2 8v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6l2-8Z" fill="#FFFFFF"/>
        <path d="M2 13h6l2 3h4l2-3h6v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6Z" fill="#FCA5A5" stroke="#202124"/>
      </svg>`;

    const iconUnassigned = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <path d="m3 7 9 6 9-6"/>
      </svg>`;

    const iconMine = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="4"/>
        <path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5Z"/>
      </svg>`;

    const iconTeam = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="8" r="3.5"/>
        <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5Z" fill="#FCA5A5"/>
        <circle cx="17" cy="9" r="2.5"/>
        <path d="M15 19c.3-2.2 2-3.8 4.5-3.8 1 0 1.8.3 2.5.8"/>
      </svg>`;

    const iconAllViews = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="6" width="14" height="14" rx="2" fill="#FFFFFF"/>
        <path d="M4 16V5a1 1 0 0 1 1-1h11"/>
        <line x1="9" y1="10" x2="17" y2="10"/>
        <line x1="9" y1="14" x2="15" y2="14"/>
      </svg>`;

    const iconTags = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
        <circle cx="7" cy="7" r="1.5" fill="#202124"/>
      </svg>`;

    const iconAnalytics = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
        <path d="M22 12A10 10 0 0 0 12 2v10z" fill="#FCA5A5" stroke="#202124"/>
      </svg>`;

    const iconTemplates = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="6" width="18" height="14" rx="2" fill="#FFFFFF"/>
        <path d="m3 8 9 6 9-6" fill="#FCA5A5"/>
      </svg>`;

    const iconContacts = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="#FCA5A5"/>
        <circle cx="12" cy="10" r="2.5" fill="#FFFFFF"/>
        <path d="M8.5 16c.8-1.8 2-2.5 3.5-2.5s2.7.7 3.5 2.5" fill="#FFFFFF"/>
      </svg>`;

    const iconAdmin = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#FCA5A5"/>
      </svg>`;

    container.innerHTML = `
      <!-- Assigned to me -->
      <div class="threadly-nav-item ${
        activeLeftView === 'assigned_to_me' ? 'threadly-active' : ''
      }" data-nav-query="?view=assigned_to_me" data-view-key="assigned_to_me">
        <div class="threadly-nav-left">
          <span class="threadly-caret-gutter"></span>
          <span class="threadly-icon-slot">${iconAssignedToMe}</span>
          <span>Assigned to me</span>
        </div>
        <span class="threadly-nav-badge">${assignedToMeCount > 0 ? assignedToMeCount : ''}</span>
      </div>

      <!-- Following -->
      <div class="threadly-nav-item ${
        activeLeftView === 'following' ? 'threadly-active' : ''
      }" data-nav-query="?view=following" data-view-key="following">
        <div class="threadly-nav-left">
          <span class="threadly-caret-gutter"></span>
          <span class="threadly-icon-slot">${iconFollowing}</span>
          <span>Following</span>
        </div>
        <span class="threadly-nav-badge">${followingCount > 0 ? followingCount : ''}</span>
      </div>

      <!-- Dynamic Shared Inboxes from SQLite -->
      ${inboxes
        .map(ib => {
          const isExp = Boolean(expandedInboxes[ib.id]);
          const unassCnt = ib.counts?.unassigned || 0;
          const mineCnt = currentUser ? ib.counts?.by_user?.[currentUser.id] || 0 : 0;

          return `
            <div class="threadly-nav-item threadly-inbox-toggle" data-inbox-id="${ib.id}">
              <div class="threadly-nav-left">
                <span class="threadly-caret-gutter">${isExp ? '&#9662;' : '&#9656;'}</span>
                <span class="threadly-icon-slot">${iconSharedInbox}</span>
                <span>${ib.name}</span>
              </div>
            </div>

            ${
              isExp
                ? `
              <div class="threadly-nav-item threadly-nav-subitem ${
                activeLeftView === `unassigned_${ib.id}` ? 'threadly-active' : ''
              }" data-nav-query="?view=unassigned&inbox_id=${ib.id}" data-view-key="unassigned_${ib.id}">
                <div class="threadly-nav-left">
                  <span class="threadly-icon-slot">${iconUnassigned}</span>
                  <span>Unassigned</span>
                </div>
                <span class="threadly-nav-badge">${unassCnt > 0 ? unassCnt : ''}</span>
              </div>

              <div class="threadly-nav-item threadly-nav-subitem ${
                activeLeftView === `mine_${ib.id}` ? 'threadly-active' : ''
              }" data-nav-query="?view=mine&inbox_id=${ib.id}" data-view-key="mine_${ib.id}">
                <div class="threadly-nav-left">
                  <span class="threadly-icon-slot">${iconMine}</span>
                  <span>Mine</span>
                </div>
                <span class="threadly-nav-badge">${mineCnt > 0 ? mineCnt : ''}</span>
              </div>

              <div class="threadly-nav-item threadly-nav-subitem ${
                activeSlideoverMode === 'team' && activeSlideoverInboxId === ib.id
                  ? 'threadly-active'
                  : ''
              }" data-slideover="team" data-inbox-id="${ib.id}">
                <div class="threadly-nav-left">
                  <span class="threadly-icon-slot">${iconTeam}</span>
                  <span>Team</span>
                </div>
              </div>

              <div class="threadly-nav-item threadly-nav-subitem ${
                activeSlideoverMode === 'all_views' && activeSlideoverInboxId === ib.id
                  ? 'threadly-active'
                  : ''
              }" data-slideover="all_views" data-inbox-id="${ib.id}">
                <div class="threadly-nav-left">
                  <span class="threadly-icon-slot">${iconAllViews}</span>
                  <span>All views</span>
                </div>
              </div>

              <div class="threadly-nav-item threadly-nav-subitem ${
                activeSlideoverMode === 'tags' && activeSlideoverInboxId === ib.id
                  ? 'threadly-active'
                  : ''
              }" data-slideover="tags" data-inbox-id="${ib.id}">
                <div class="threadly-nav-left">
                  <span class="threadly-icon-slot">${iconTags}</span>
                  <span>Tags</span>
                </div>
              </div>
            `
                : ''
            }
          `;
        })
        .join('')}

      <!-- Analytics -->
      <div class="threadly-nav-item ${
        activeLeftView === 'analytics' ? 'threadly-active' : ''
      }" data-nav-query="?modal=analytics" data-view-key="analytics">
        <div class="threadly-nav-left">
          <span class="threadly-caret-gutter"></span>
          <span class="threadly-icon-slot">${iconAnalytics}</span>
          <span>Analytics</span>
        </div>
      </div>

      <!-- Email Templates -->
      <div class="threadly-nav-item ${
        activeLeftView === 'templates' ? 'threadly-active' : ''
      }" data-nav-query="?modal=templates" data-view-key="templates">
        <div class="threadly-nav-left">
          <span class="threadly-caret-gutter"></span>
          <span class="threadly-icon-slot">${iconTemplates}</span>
          <span>Email Templates</span>
        </div>
      </div>

      <!-- Contacts -->
      <div class="threadly-nav-item ${
        activeLeftView === 'contacts' ? 'threadly-active' : ''
      }" data-nav-query="?modal=contacts" data-view-key="contacts">
        <div class="threadly-nav-left">
          <span class="threadly-caret-gutter"></span>
          <span class="threadly-icon-slot">${iconContacts}</span>
          <span>Contacts</span>
        </div>
      </div>

      <!-- Admin Panel -->
      <div class="threadly-nav-item ${
        activeLeftView === 'admin' ? 'threadly-active' : ''
      }" data-nav-query="?modal=admin" data-view-key="admin">
        <div class="threadly-nav-left">
          <span class="threadly-caret-gutter"></span>
          <span class="threadly-icon-slot">${iconAdmin}</span>
          <span>Admin Panel</span>
        </div>
      </div>
    `;

    // 1. Toggle Shared Inbox expand/collapse
    container.querySelectorAll('.threadly-inbox-toggle').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const id = Number(el.getAttribute('data-inbox-id'));
        expandedInboxes[id] = !expandedInboxes[id];
        injectLeftSidebar();
      };
    });

    // 2. Direct View / Modal navigation buttons (Assigned to me, Following, Unassigned, Mine, Analytics, Email Templates, Contacts, Admin Panel)
    container.querySelectorAll('[data-nav-query]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const query = el.getAttribute('data-nav-query') || '';
        const key = el.getAttribute('data-view-key') || '';
        activeLeftView = key;
        closeLeftSlideover();
        injectLeftSidebar();
        openEmbeddedWorkspaceModal(query);
      };
    });

    // 3. Slide-over triggers (Team, All views, Tags)
    container.querySelectorAll('[data-slideover]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const mode = el.getAttribute('data-slideover');
        const ibId = Number(el.getAttribute('data-inbox-id'));
        const inboxObj = inboxes.find(i => i.id === ibId) || inboxes[0];
        if (activeSlideoverMode === mode && activeSlideoverInboxId === ibId) {
          closeLeftSlideover();
          injectLeftSidebar();
        } else {
          openLeftSlideover(mode, inboxObj);
        }
      };
    });
  }

  function closeLeftSlideover() {
    activeSlideoverMode = null;
    activeSlideoverInboxId = null;
    const existing = document.getElementById('threadly-left-slideover');
    if (existing) existing.remove();
  }

  // Slide-over drawer for Team, All views, and Tags synced with SQLite & Dashboard
  function openLeftSlideover(mode, inbox) {
    const existing = document.getElementById('threadly-left-slideover');
    if (existing) existing.remove();

    activeSlideoverMode = mode;
    activeSlideoverInboxId = inbox.id;
    injectLeftSidebar();

    const drawer = document.createElement('div');
    drawer.id = 'threadly-left-slideover';
    drawer.className = 'threadly-ext-root';

    const currentUser = getActiveUserObj();
    const unassignedCount = inbox.counts?.unassigned || 0;
    const totalUnresolved = inbox.counts?.open || 0;
    const mineCount = currentUser ? inbox.counts?.by_user?.[currentUser.id] || 0 : 0;
    const teamCount = inbox.counts?.assigned_total || 0;

    if (mode === 'team') {
      const users = bootstrap.users || [];

      drawer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 6px 12px 6px;">
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;color:#0F172A;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8">
              <circle cx="9" cy="8" r="3.5"/>
              <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5Z" fill="#FCA5A5"/>
              <circle cx="17" cy="9" r="2.5"/>
              <path d="M15 19c.3-2.2 2-3.8 4.5-3.8"/>
            </svg>
            <span>Team</span>
          </div>
          <button id="threadly-close-slideover" style="background:none;border:none;font-size:18px;color:#5F6368;cursor:pointer;line-height:1;">&times;</button>
        </div>

        <div style="position:relative;margin-bottom:14px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" style="position:absolute;left:10px;top:9px;">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="threadly-slideover-search" type="text" placeholder="Search" style="width:100%;box-sizing:border-box;padding:7px 10px 7px 32px;border:1px solid #CBD5E1;border-radius:6px;font-size:12.5px;outline:none;"/>
        </div>

        <div id="threadly-slideover-team-list" style="display:flex;flex-direction:column;gap:4px;">
          <div class="threadly-slideover-row" data-query="?view=team&inbox_id=${inbox.id}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:9999px;background:#FEE2E2;color:#991B1B;font-size:13px;font-weight:600;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:24px;height:24px;border-radius:9999px;background:#FCA5A5;color:#991B1B;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>
              </span>
              <span>All assignees</span>
            </div>
            <span style="font-size:12px;font-weight:700;">${teamCount > 0 ? teamCount : ''}</span>
          </div>

          ${users
            .map(
              u => `
            <div class="threadly-slideover-row" data-query="?view=mine&inbox_id=${inbox.id}&assignee_id=${u.id}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:9999px;color:#0F172A;font-size:13px;font-weight:500;cursor:pointer;">
              <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                <span style="width:24px;height:24px;border-radius:9999px;background:#DC2626;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">
                  ${u.name.charAt(0).toUpperCase()}
                </span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.name}</span>
              </div>
              <span style="font-size:12px;font-weight:600;color:#64748B;">${
                inbox.counts?.by_user?.[u.id] || ''
              }</span>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    } else if (mode === 'all_views') {
      const crimsonStar = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="#DC2626" stroke="#DC2626" stroke-width="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>`;

      drawer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 6px 12px 6px;">
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;color:#0F172A;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.8">
              <path d="M4 5h16l2 8v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6l2-8Z" fill="#FFFFFF"/>
              <path d="M2 13h6l2 3h4l2-3h6v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6Z" fill="#FCA5A5" stroke="#202124"/>
            </svg>
            <span>${inbox.name}</span>
          </div>
          <button id="threadly-close-slideover" style="background:none;border:none;font-size:18px;color:#5F6368;cursor:pointer;line-height:1;">&times;</button>
        </div>

        <div style="position:relative;margin-bottom:14px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" style="position:absolute;left:10px;top:9px;">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="threadly-slideover-search" type="text" placeholder="Search" style="width:100%;box-sizing:border-box;padding:7px 10px 7px 32px;border:1px solid #CBD5E1;border-radius:6px;font-size:12.5px;outline:none;"/>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px 8px 8px;">
          <span style="font-size:12px;font-weight:600;color:#DC2626;">All views</span>
          <button id="threadly-add-custom-view" title="Configure Shared Inbox views" style="background:#FFFFFF;border:1px solid #FECACA;color:#DC2626;border-radius:9999px;width:24px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;cursor:pointer;line-height:1;">+</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:2px;">
          <!-- All unresolved -->
          <div class="threadly-slideover-row" data-query="?view=open&inbox_id=${inbox.id}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:9999px;background:#FEE2E2;color:#991B1B;font-size:13px;font-weight:600;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" stroke-dasharray="4 2"/></svg>
              <span>All unresolved</span>
            </div>
            <span style="font-size:12px;font-weight:700;">${totalUnresolved}</span>
          </div>

          <!-- Unassigned -->
          <div class="threadly-slideover-row" data-query="?view=unassigned&inbox_id=${inbox.id}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:9999px;color:#202124;font-size:13px;font-weight:500;cursor:pointer;margin-top:6px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              <span>Unassigned</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              ${crimsonStar}
              <span style="font-size:12px;font-weight:600;min-width:10px;text-align:right;">${unassignedCount}</span>
            </div>
          </div>

          <!-- Mine -->
          <div class="threadly-slideover-row" data-query="?view=mine&inbox_id=${inbox.id}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:9999px;color:#202124;font-size:13px;font-weight:500;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5Z"/></svg>
              <span>Mine</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              ${crimsonStar}
              <span style="font-size:12px;min-width:10px;text-align:right;">${mineCount > 0 ? mineCount : ''}</span>
            </div>
          </div>

          <!-- Team -->
          <div class="threadly-slideover-row" data-query="?view=team&inbox_id=${inbox.id}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:9999px;color:#202124;font-size:13px;font-weight:500;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7"><circle cx="9" cy="8" r="3.5"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5Z" fill="#FCA5A5"/><circle cx="17" cy="9" r="2.5"/></svg>
              <span>Team</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              ${crimsonStar}
              <span style="font-size:12px;min-width:10px;text-align:right;">${teamCount > 0 ? teamCount : ''}</span>
            </div>
          </div>

          <div style="height:10px;"></div>

          <!-- Pending -->
          <div class="threadly-slideover-row" data-query="?view=pending&inbox_id=${inbox.id}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:9999px;color:#202124;font-size:13px;font-weight:500;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="14" y1="9" x2="14" y2="15"/></svg>
              <span>Pending</span>
            </div>
            <span style="font-size:12px;font-weight:600;">${inbox.counts?.pending || ''}</span>
          </div>

          <!-- Closed -->
          <div class="threadly-slideover-row" data-query="?view=closed&inbox_id=${inbox.id}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:9999px;color:#202124;font-size:13px;font-weight:500;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
              <span>Closed</span>
            </div>
            <span style="font-size:12px;font-weight:600;">${inbox.counts?.closed || ''}</span>
          </div>
        </div>
      `;
    } else if (mode === 'tags') {
      const tags = bootstrap.tags || [];
      drawer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 6px 12px 6px;">
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;color:#0F172A;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#FCA5A5" stroke="#202124" stroke-width="1.8">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
            </svg>
            <span>Tags</span>
          </div>
          <button id="threadly-close-slideover" style="background:none;border:none;font-size:18px;color:#5F6368;cursor:pointer;line-height:1;">&times;</button>
        </div>

        <div style="position:relative;margin-bottom:12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" style="position:absolute;left:10px;top:9px;">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="threadly-slideover-search" type="text" placeholder="Search tags" style="width:100%;box-sizing:border-box;padding:7px 10px 7px 32px;border:1px solid #CBD5E1;border-radius:6px;font-size:12.5px;outline:none;"/>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px 8px 8px;">
          <span style="font-size:12px;font-weight:600;color:#DC2626;">Shared Tags</span>
          <button id="threadly-add-new-tag-slideover" title="Create new tag" style="background:#FFFFFF;border:1px solid #FECACA;color:#DC2626;border-radius:9999px;width:24px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;cursor:pointer;line-height:1;">+</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:4px;overflow-y:auto;">
          ${tags
            .map(
              t => `
            <div class="threadly-slideover-row" data-query="?tag_id=${t.id}&inbox_id=${inbox.id}" style="display:flex;align-items:center;gap:10px;padding:7px 12px;border-radius:9999px;color:#202124;font-size:13px;font-weight:500;cursor:pointer;">
              <span style="width:10px;height:10px;border-radius:9999px;background:#DC2626;flex-shrink:0;"></span>
              <span>${t.name}</span>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    document.body.appendChild(drawer);

    const closeBtn = document.getElementById('threadly-close-slideover');
    if (closeBtn) {
      closeBtn.onclick = () => {
        closeLeftSlideover();
        injectLeftSidebar();
      };
    }

    const addCustomViewBtn = document.getElementById('threadly-add-custom-view');
    if (addCustomViewBtn) {
      addCustomViewBtn.onclick = () => {
        closeLeftSlideover();
        openEmbeddedWorkspaceModal('?modal=admin');
      };
    }

    const addNewTagBtn = document.getElementById('threadly-add-new-tag-slideover');
    if (addNewTagBtn) {
      addNewTagBtn.onclick = async () => {
        const name = window.prompt('Enter new Shared Tag name:');
        if (!name || !name.trim()) return;
        await apiCall('/api/tags', 'POST', { name: name.trim(), color: '#DC2626' });
        await refreshBootstrap();
        openLeftSlideover('tags', inbox);
      };
    }

    const searchInput = document.getElementById('threadly-slideover-search');
    if (searchInput) {
      searchInput.oninput = e => {
        const q = (e.target.value || '').toLowerCase();
        drawer.querySelectorAll('.threadly-slideover-row').forEach(row => {
          const text = (row.textContent || '').toLowerCase();
          row.style.display = text.includes(q) ? 'flex' : 'none';
        });
      };
    }

    drawer.querySelectorAll('.threadly-slideover-row').forEach(row => {
      row.onclick = () => {
        const query = row.getAttribute('data-query') || '';
        closeLeftSlideover();
        injectLeftSidebar();
        openEmbeddedWorkspaceModal(query);
      };
    });
  }

  function showExtensionNotice(text) {
    const existing = document.getElementById('threadly-ext-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'threadly-ext-toast';
    toast.style.cssText =
      'position:fixed;bottom:24px;right:24px;background:#0F172A;color:#FFFFFF;padding:10px 18px;border-radius:10px;font-size:12px;font-weight:600;z-index:9999999;box-shadow:0 12px 28px rgba(0,0,0,0.28);display:flex;align-items:center;gap:10px;border:1px solid #334155;font-family:system-ui,-apple-system,sans-serif;letter-spacing:-0.01em;transition:all 0.25s ease;';
    toast.innerHTML = `
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#DC2626;"></span>
      <span>${text}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 250);
    }, 2400);
  }

  function closeEmbeddedWorkspace() {
    const existing = document.getElementById('threadly-embedded-workspace');
    if (existing) {
      existing.style.opacity = '0';
      existing.style.transform = 'scale(0.99)';
      existing.style.transition = 'opacity 0.16s ease, transform 0.16s ease';
      setTimeout(() => {
        existing.remove();
        refreshBootstrap();
      }, 160);
    }
  }

  // Listen for close commands from embedded dashboard iframe
  window.addEventListener('message', event => {
    if (event && event.data && event.data.type === 'THREADLY_CLOSE_EMBED') {
      closeEmbeddedWorkspace();
    }
  });

  // Esc key closes embedded workspace and returns to Gmail inbox
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const existing = document.getElementById('threadly-embedded-workspace');
      if (existing) {
        closeEmbeddedWorkspace();
      }
    }
  });

  function openEmbeddedWorkspaceModal(queryString = '') {
    const existing = document.getElementById('threadly-embedded-workspace');
    if (existing) existing.remove();

    // Query string with embedded=1 to inform dashboard it is running in same Gmail screen
    const baseQuery = queryString
      ? queryString.startsWith('?')
        ? queryString.slice(1)
        : queryString
      : '';
    const fullQuery = baseQuery ? `?${baseQuery}&embedded=1` : '?embedded=1';
    const targetUrl = `${DASHBOARD_URL}/${fullQuery}`;

    const container = document.createElement('div');
    container.id = 'threadly-embedded-workspace';
    container.className = 'threadly-iframe-fullscreen threadly-ext-root';

    container.innerHTML = `
      <div style="position:fixed;top:10px;right:22px;z-index:10000000;display:flex;align-items:center;gap:8px;">
        <button id="threadly-popout-dash" title="Open in dedicated browser tab" style="background:#FFFFFF;color:#334155;border:1px solid #CBD5E1;border-radius:20px;padding:6px 13px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:5px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.06);transition:all 0.15s ease;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>Pop Out</span>
        </button>
        <button id="threadly-close-embed" title="Return to regular Gmail (Esc)" style="background:#0F172A;color:#FFFFFF;border:none;border-radius:20px;padding:6px 15px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer;box-shadow:0 3px 10px rgba(15,23,42,0.28);transition:all 0.15s ease;">
          <span>← Back to Gmail</span>
          <span style="font-size:9px;opacity:0.75;background:#334155;padding:1px 5px;border-radius:4px;">Esc</span>
        </button>
      </div>
      <iframe src="${targetUrl}" style="width:100%;height:100%;flex:1;border:none;background:#F8FAFC;margin:0;padding:0;display:block;" allow="clipboard-read; clipboard-write"></iframe>
    `;

    document.body.appendChild(container);

    const closeBtn = document.getElementById('threadly-close-embed');
    if (closeBtn) closeBtn.onclick = closeEmbeddedWorkspace;

    const popoutBtn = document.getElementById('threadly-popout-dash');
    if (popoutBtn) {
      popoutBtn.onclick = () => {
        closeEmbeddedWorkspace();
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: targetUrl });
        } else {
          window.open(targetUrl, '_blank');
        }
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 2. EXTRACT & SYNC OPEN GMAIL EMAIL THREAD + BULK LIST SYNC (INBOX & SENT)
  // ---------------------------------------------------------------------------
  let lastBulkSyncSignature = '';

  async function syncVisibleGmailListRows(force = false) {
    detectLoggedInGmailUser();
    const rows = Array.from(document.querySelectorAll('tr.zA'));
    if (rows.length === 0) return;

    const isSentView =
      window.location.hash.includes('#sent') ||
      window.location.hash.includes('in%3Asent');

    const extracted = [];
    rows.slice(0, 35).forEach((row, idx) => {
      const subjectEl = row.querySelector('.bog') || row.querySelector('.y6 span');
      const subject = subjectEl ? (subjectEl.textContent || '').trim() : '';
      if (!subject) return;

      const snippetEl = row.querySelector('.y2');
      const snippet = snippetEl
        ? (snippetEl.textContent || '').replace(/^\s*-\s*/, '').trim()
        : subject;

      const participantEl = row.querySelector('.yX span[email], .yW span[email], .zF[email], .yP[email]');
      const participantEmail = participantEl
        ? participantEl.getAttribute('email') || ''
        : '';
      const participantName = participantEl
        ? participantEl.getAttribute('name') || (participantEl.textContent || '').trim()
        : 'Contact';

      const threadIdAttr =
        row.getAttribute('data-legacy-thread-id') ||
        row.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') ||
        `row_${isSentView ? 'sent' : 'inbox'}_${subject.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}_${idx}`;

      if (isSentView) {
        extracted.push({
          gmail_thread_id: `gmail_${threadIdAttr}`,
          subject,
          sender_name: getActiveActorName(),
          sender_email: activeUserEmail,
          recipient_email: participantEmail || 'customer@gmail.com',
          customer_name: participantName === 'me' ? 'Recipient' : participantName,
          customer_email: participantEmail || 'customer@gmail.com',
          body: snippet || subject,
          is_sent: true,
        });
      } else {
        extracted.push({
          gmail_thread_id: `gmail_${threadIdAttr}`,
          subject,
          sender_name: participantName,
          sender_email: participantEmail || 'customer@gmail.com',
          recipient_email: activeUserEmail,
          customer_name: participantName,
          customer_email: participantEmail || 'customer@gmail.com',
          body: snippet || subject,
          is_sent: false,
        });
      }
    });

    if (extracted.length === 0) return;

    const sig = `${isSentView ? 'sent' : 'inbox'}:${extracted.length}:${extracted[0].subject}`;
    if (!force && sig === lastBulkSyncSignature) return;
    lastBulkSyncSignature = sig;

    await apiCall('/api/gmail/extension-bulk-sync', 'POST', {
      account_email: activeUserEmail,
      emails: extracted,
    });
    refreshBootstrap();
  }

  function extractGmailThreadInfo() {
    const subjectEl = document.querySelector('h2.hP');
    if (!subjectEl) return null;
    const subject = (subjectEl.textContent || '').trim();
    if (!subject) return null;

    const senderEl = document.querySelector('span.gD');
    const senderName = senderEl
      ? senderEl.getAttribute('name') || senderEl.textContent || 'Customer'
      : 'Customer';
    const senderEmail = senderEl
      ? senderEl.getAttribute('email') || 'customer@gmail.com'
      : 'customer@gmail.com';

    const toEl = document.querySelector('span.g2[email]');
    const toEmail = toEl ? toEl.getAttribute('email') || activeUserEmail : activeUserEmail;
    const toName = toEl ? toEl.getAttribute('name') || toEmail.split('@')[0] : 'Customer';

    const bodyEl = document.querySelector('div.a3s.aiL');
    const body = bodyEl ? (bodyEl.textContent || '').trim().slice(0, 2000) : '';
    const hashId = window.location.hash.replace(/[^a-zA-Z0-9_-]/g, '') || subject;

    const isSentByUs =
      senderEmail.toLowerCase() === activeUserEmail.toLowerCase() ||
      (bootstrap.users || []).some(u => u.email && u.email.toLowerCase() === senderEmail.toLowerCase());

    return {
      gmail_thread_id: `gmail_${hashId}`,
      subject,
      customer_name: isSentByUs ? toName : senderName,
      customer_email: isSentByUs ? toEmail : senderEmail,
      sender_name: senderName,
      sender_email: senderEmail,
      recipient_email: toEmail,
      body,
      is_sent: isSentByUs,
    };
  }

  async function syncCurrentGmailThread() {
    const info = extractGmailThreadInfo();
    if (!info) return;
    if (info.subject === lastSyncedSubject && activeConversation) return;
    lastSyncedSubject = info.subject;

    await apiCall('/api/gmail/extension-bulk-sync', 'POST', {
      account_email: activeUserEmail,
      emails: [info],
    });

    const data = await apiCall('/api/conversations', 'POST', {
      ...info,
      channel: 'email',
      actor_name: getActiveActorName(),
    });
    if (data && data.id) {
      activeConversation = data;
      renderSidebar();
      injectComposeToolbar();
      refreshBootstrap();
    }
  }

  // ---------------------------------------------------------------------------
  // 3. TOP BAR WIDGET
  // ---------------------------------------------------------------------------
  function renderTopWidget() {
    let widget = document.getElementById('threadly-gmail-topbar-widget');
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'threadly-gmail-topbar-widget';
      widget.className = 'threadly-ext-root';
      document.body.appendChild(widget);
    }

    const done = bootstrap.setup?.completedCount || 0;
    const userSelectOptions = (bootstrap.users || [])
      .map(
        u =>
          `<option value="${u.email}" ${
            u.email.toLowerCase() === activeUserEmail.toLowerCase() ? 'selected' : ''
          }>${u.name}</option>`
      )
      .join('');

    widget.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:5px;padding-right:8px;border-right:1px solid #E2E8F0;font-weight:600;color:#0F172A;">
        <span style="width:8px;height:8px;border-radius:9999px;background:#16A34A;display:inline-block;"></span>
        Active
      </span>
      <span class="threadly-ext-brand" style="font-size:14px;padding:0 4px;">
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
          <rect x="2" y="2" width="28" height="28" rx="8.5" fill="#DC2626"/>
          <path d="M8.5 10.5H23.5M16 10.5V22.5C16 23.6046 15.1046 24.5 14 24.5C12.8954 24.5 12 23.6046 12 22.5V17.5C12 15.8431 13.3431 14.5 15 14.5H20.5" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="22" cy="14.5" r="2" fill="#FECACA"/>
        </svg>
        <span>Thread<span style="color:#DC2626;">ly</span></span>
      </span>
      <select id="threadly-ext-user-switcher" style="border:1px solid #E2E8F0;border-radius:5px;padding:2px 6px;font-size:11px;color:#0F172A;background:#F8FAFC;">
        ${userSelectOptions}
      </select>
      <span style="font-size:11px;color:#64748B;">Setup ${done}/5</span>
      <button id="threadly-open-analytics-btn" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:5px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;">
        Admin &amp; Analytics
      </button>
      <button id="threadly-toggle-sidebar-btn" style="background:#0F172A;color:#FFFFFF;border:none;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">
        Sidebar
      </button>
    `;

    const switcher = document.getElementById('threadly-ext-user-switcher');
    if (switcher) {
      switcher.onchange = e => {
        activeUserEmail = e.target.value;
        injectLeftSidebar();
        renderSidebar();
      };
    }

    const dashBtn = document.getElementById('threadly-open-analytics-btn');
    if (dashBtn) {
      dashBtn.onclick = () => openEmbeddedWorkspaceModal();
    }
    const toggleBtn = document.getElementById('threadly-toggle-sidebar-btn');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const sb = document.getElementById('threadly-gmail-sidebar');
        if (sb) sb.classList.toggle('threadly-collapsed');
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 4. RIGHT-HAND COLLABORATION SIDEBAR
  // ---------------------------------------------------------------------------
  function renderSidebar() {
    let sidebar = document.getElementById('threadly-gmail-sidebar');
    if (!sidebar) {
      sidebar = document.createElement('aside');
      sidebar.id = 'threadly-gmail-sidebar';
      sidebar.className = 'threadly-ext-root';
      document.body.appendChild(sidebar);
    }

    if (!activeConversation) {
      sidebar.innerHTML = `
        <div style="padding:14px 16px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;">
          <span class="threadly-ext-brand" style="font-size:16px;">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="8.5" fill="#DC2626"/>
              <path d="M8.5 10.5H23.5M16 10.5V22.5C16 23.6046 15.1046 24.5 14 24.5C12.8954 24.5 12 23.6046 12 22.5V17.5C12 15.8431 13.3431 14.5 15 14.5H20.5" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="22" cy="14.5" r="2" fill="#FECACA"/>
            </svg>
            <span>Thread<span style="color:#DC2626;">ly</span></span>
          </span>
          <button id="threadly-sync-now-btn" class="threadly-btn-crimson" style="padding:4px 10px;font-size:11px;">Sync Open Email</button>
        </div>
        <div style="padding:20px 16px;color:#475569;font-size:12px;line-height:1.5;">
          <div style="font-weight:600;color:#0F172A;margin-bottom:6px;">Active Account: ${activeUserEmail}</div>
          Click any email in your Gmail inbox to load its Threadly assignment, status, tags, SLA due time, AI Summarizer, and internal notes.<br/><br/>
          <button id="threadly-sidebar-open-hub" class="threadly-btn-crimson" style="width:100%;padding:8px;">
            Open Full Threadly Hub &amp; Analytics
          </button>
        </div>
      `;
      const syncBtn = document.getElementById('threadly-sync-now-btn');
      if (syncBtn) syncBtn.onclick = syncCurrentGmailThread;
      const hubBtn = document.getElementById('threadly-sidebar-open-hub');
      if (hubBtn) hubBtn.onclick = openEmbeddedWorkspaceModal;
      return;
    }

    const c = activeConversation;
    const activities = c.activities || [];
    const notes = c.notes || [];

    const userOptions = [
      `<option value="">Unassigned</option>`,
      ...(bootstrap.users || []).map(
        u => `<option value="${u.id}" ${c.assignee_id === u.id ? 'selected' : ''}>${u.name}</option>`
      ),
    ].join('');

    const statusBg =
      c.status === 'Open' ? '#DC2626' : c.status === 'Pending' ? '#D97706' : '#059669';

    sidebar.innerHTML = `
      <div style="padding:12px 16px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;">
          <span class="threadly-ext-brand" style="font-size:15px;">
            <svg width="19" height="19" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="8.5" fill="#DC2626"/>
              <path d="M8.5 10.5H23.5M16 10.5V22.5C16 23.6046 15.1046 24.5 14 24.5C12.8954 24.5 12 23.6046 12 22.5V17.5C12 15.8431 13.3431 14.5 15 14.5H20.5" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="22" cy="14.5" r="2" fill="#FECACA"/>
            </svg>
            <span>Thread<span style="color:#DC2626;">ly</span></span>
          </span>
          <span style="font-size:11px;color:#64748B;margin-left:6px;font-family:monospace;">#${c.conversation_code}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button id="threadly-ext-ai-btn" title="AI Summarizer" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;">
            AI Summary
          </button>
          <button id="threadly-ext-share-btn" title="Share Conversation" style="background:#F8FAFC;color:#0F172A;border:1px solid #E2E8F0;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;">
            Share
          </button>
        </div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
        <div style="font-size:12px;font-weight:600;color:#0F172A;">
          ${c.inbox_name || 'Main Shared Inbox'} (${c.inbox_email || 'inbox@threadly.io'})
        </div>

        ${
          c.resolution_due_at
            ? `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:8px 10px;font-size:11px;color:#334155;">
                Resolution due by <strong>${new Date(c.resolution_due_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}</strong>
              </div>`
            : ''
        }

        <div style="display:grid;grid-template-columns:1fr 110px;gap:10px;align-items:end;">
          <div>
            <label style="display:block;font-size:11px;color:#64748B;margin-bottom:4px;">Assigned to</label>
            <select id="threadly-ext-assignee" style="width:100%;border:1px solid #CBD5E1;border-radius:6px;padding:5px 8px;font-size:12px;color:#0F172A;">
              ${userOptions}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#64748B;margin-bottom:4px;">Status</label>
            <select id="threadly-ext-status" style="width:100%;border:none;border-radius:6px;padding:6px 8px;font-size:12px;font-weight:600;color:#FFFFFF;background:${statusBg};">
              <option value="Open" ${c.status === 'Open' ? 'selected' : ''} style="background:#fff;color:#0F172A;">Open</option>
              <option value="Pending" ${c.status === 'Pending' ? 'selected' : ''} style="background:#fff;color:#0F172A;">Pending</option>
              <option value="Closed" ${c.status === 'Closed' ? 'selected' : ''} style="background:#fff;color:#0F172A;">Closed</option>
            </select>
          </div>
        </div>

        <div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <button id="threadly-ext-add-tag-btn" style="background:#F1F5F9;color:#334155;border:none;border-radius:9999px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">
              + TAG
            </button>
            ${(c.tags || [])
              .map(
                t =>
                  `<span data-tag-id="${t.id}" class="threadly-ext-tag-pill" style="border:1px solid ${t.color};color:${t.color};background:${t.color}14;border-radius:9999px;padding:2px 9px;font-size:11px;font-weight:500;cursor:pointer;" title="Click to remove">${t.name}</span>`
              )
              .join('')}
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;color:#0F172A;margin-bottom:4px;">Priority</label>
          <select id="threadly-ext-priority" style="width:100%;border:1px solid #CBD5E1;border-radius:6px;padding:6px 8px;font-size:12px;color:#0F172A;">
            ${['--', 'Low', 'Medium', 'High', 'Urgent']
              .map(p => `<option value="${p}" ${c.priority === p ? 'selected' : ''}>${p}</option>`)
              .join('')}
          </select>
        </div>

        <div style="border-top:1px solid #E2E8F0;padding-top:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <select id="threadly-ext-activity-filter" style="font-size:12px;font-weight:600;color:#0F172A;border:none;background:transparent;cursor:pointer;">
              <option value="all" ${activityFilter === 'all' ? 'selected' : ''}>All activity (${activities.length})</option>
              <option value="notes" ${activityFilter === 'notes' ? 'selected' : ''}>Only notes (${notes.length})</option>
            </select>
          </div>

          <form id="threadly-ext-note-form" style="margin-bottom:12px;">
            <input id="threadly-ext-note-input" type="text" placeholder="+ Add a note (@teammate)..." style="width:100%;box-sizing:border-box;background:#F1F5F9;border:1px solid transparent;border-radius:6px;padding:8px 10px;font-size:12px;color:#0F172A;" />
          </form>

          <div style="display:flex;flex-direction:column;gap:8px;">
            ${notes
              .map(
                n => `
              <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px 10px;font-size:11px;">
                <div style="font-weight:600;color:#991B1B;margin-bottom:2px;">${n.author_name}</div>
                <div style="color:#0F172A;white-space:pre-line;">${n.body}</div>
              </div>
            `
              )
              .join('')}

            ${
              activityFilter === 'all'
                ? activities
                    .map(
                      a => `
                  <div style="font-size:11px;color:#334155;padding:4px 0;border-bottom:1px solid #F8FAFC;">
                    <div>${a.description}</div>
                    <div style="font-size:10px;color:#94A3B8;margin-top:2px;">${new Date(
                      a.created_at
                    ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                `
                    )
                    .join('')
                : ''
            }
          </div>
        </div>
      </div>
    `;

    const assigneeEl = document.getElementById('threadly-ext-assignee');
    if (assigneeEl) {
      assigneeEl.onchange = async e => {
        const updated = await apiCall(`/api/conversations/${c.id}`, 'PATCH', {
          assignee_id: e.target.value ? Number(e.target.value) : null,
          actor_name: getActiveActorName(),
        });
        if (updated) {
          activeConversation = updated;
          renderSidebar();
          refreshBootstrap();
        }
      };
    }

    const statusEl = document.getElementById('threadly-ext-status');
    if (statusEl) {
      statusEl.onchange = async e => {
        const updated = await apiCall(`/api/conversations/${c.id}`, 'PATCH', {
          status: e.target.value,
          actor_name: getActiveActorName(),
        });
        if (updated) {
          activeConversation = updated;
          renderSidebar();
          refreshBootstrap();
        }
      };
    }

    const priorityEl = document.getElementById('threadly-ext-priority');
    if (priorityEl) {
      priorityEl.onchange = async e => {
        const updated = await apiCall(`/api/conversations/${c.id}`, 'PATCH', {
          priority: e.target.value,
          actor_name: getActiveActorName(),
        });
        if (updated) {
          activeConversation = updated;
          renderSidebar();
        }
      };
    }

    const addTagBtn = document.getElementById('threadly-ext-add-tag-btn');
    if (addTagBtn) {
      addTagBtn.onclick = async () => {
        const tagName = window.prompt('Enter tag name to apply (e.g. Bulk Order, Damaged):');
        if (!tagName || !tagName.trim()) return;
        const updated = await apiCall(`/api/conversations/${c.id}/tags`, 'POST', {
          tag_name: tagName.trim(),
          actor_name: getActiveActorName(),
        });
        if (updated) {
          activeConversation = updated;
          renderSidebar();
        }
      };
    }

    document.querySelectorAll('.threadly-ext-tag-pill').forEach(el => {
      el.onclick = async () => {
        const tid = el.getAttribute('data-tag-id');
        const updated = await apiCall(
          `/api/conversations/${c.id}/tags/${tid}?actor_name=${encodeURIComponent(
            getActiveActorName()
          )}`,
          'DELETE'
        );
        if (updated) {
          activeConversation = updated;
          renderSidebar();
        }
      };
    });

    const filterEl = document.getElementById('threadly-ext-activity-filter');
    if (filterEl) {
      filterEl.onchange = e => {
        activityFilter = e.target.value;
        renderSidebar();
      };
    }

    const noteForm = document.getElementById('threadly-ext-note-form');
    if (noteForm) {
      noteForm.onsubmit = async e => {
        e.preventDefault();
        const input = document.getElementById('threadly-ext-note-input');
        if (!input || !input.value.trim()) return;
        const updated = await apiCall(`/api/conversations/${c.id}/notes`, 'POST', {
          author_name: getActiveActorName(),
          body: input.value.trim(),
        });
        if (updated) {
          activeConversation = updated;
          renderSidebar();
        }
      };
    }

    const aiBtn = document.getElementById('threadly-ext-ai-btn');
    if (aiBtn) aiBtn.onclick = openAiModal;

    const shareBtn = document.getElementById('threadly-ext-share-btn');
    if (shareBtn) shareBtn.onclick = openShareModal;
  }

  async function openAiModal() {
    if (!activeConversation) return;
    const data = await apiCall(
      `/api/conversations/${activeConversation.id}/ai-summarize`,
      'POST'
    );

    const modal = document.createElement('div');
    modal.className = 'threadly-modal-backdrop';
    modal.innerHTML = `
      <div class="threadly-modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <strong style="font-size:14px;color:#0F172A;">AI Summarizer</strong>
          <button id="threadly-close-ai-modal" style="background:none;border:none;cursor:pointer;font-size:16px;">&times;</button>
        </div>
        <textarea id="threadly-ai-summary-text" rows="6" style="width:100%;box-sizing:border-box;border:1px solid #CBD5E1;border-radius:8px;padding:10px;font-size:12px;color:#0F172A;margin-bottom:14px;">${
          data?.summary || ''
        }</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:#64748B;">Was this summary helpful?</span>
          <button id="threadly-save-ai-note" class="threadly-btn-crimson">Save as note</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('threadly-close-ai-modal').onclick = () => modal.remove();
    document.getElementById('threadly-save-ai-note').onclick = async () => {
      const text = document.getElementById('threadly-ai-summary-text').value;
      const updated = await apiCall(
        `/api/conversations/${activeConversation.id}/notes`,
        'POST',
        {
          author_name: getActiveActorName(),
          body: text,
          is_ai_summary: 1,
        }
      );
      if (updated) activeConversation = updated;
      modal.remove();
      renderSidebar();
    };
  }

  function openShareModal() {
    if (!activeConversation) return;
    const modal = document.createElement('div');
    modal.className = 'threadly-modal-backdrop';
    modal.innerHTML = `
      <div class="threadly-modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <strong style="font-size:14px;color:#0F172A;">Share this conversation</strong>
          <button id="threadly-close-share-modal" style="background:none;border:none;cursor:pointer;font-size:16px;">&times;</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <div style="font-size:12px;font-weight:600;color:#0F172A;">Conversation ID</div>
            <div style="font-size:12px;color:#64748B;font-family:monospace;">${activeConversation.conversation_code}</div>
          </div>
          <button id="threadly-copy-id-btn" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">Copy ID</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:12px;font-weight:600;color:#0F172A;">Private Workspace Link</div>
            <div style="font-size:11px;color:#64748B;">Share with teammates</div>
          </div>
          <button id="threadly-copy-link-btn" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">Copy link</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('threadly-close-share-modal').onclick = () => modal.remove();
    document.getElementById('threadly-copy-id-btn').onclick = e => {
      navigator.clipboard.writeText(activeConversation.conversation_code);
      e.target.textContent = 'Copied';
    };
    document.getElementById('threadly-copy-link-btn').onclick = e => {
      navigator.clipboard.writeText(
        `${DASHBOARD_URL}/?thread=${activeConversation.conversation_code}`
      );
      e.target.textContent = 'Copied';
    };
  }

  function injectComposeToolbar() {
    const convCode = activeConversation?.conversation_code || '#2446-0001';
    const customerEmail = activeConversation?.customer_email || 'customer@gmail.com';

    // 1. Inject "Split conversation" pill button directly next to Gmail's "Reply" & "Forward" pills (.amn)
    const replyForwardBars = document.querySelectorAll('.amn');
    replyForwardBars.forEach(actionBar => {
      if (actionBar.querySelector('.threadly-split-pill-btn')) return;

      const splitPill = document.createElement('span');
      splitPill.className = 'threadly-split-pill-btn threadly-ext-root';
      splitPill.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 16px;margin-left:8px;border:1px solid #DC2626;border-radius:9999px;background:#FEF2F2;color:#DC2626;font-size:13px;font-weight:600;cursor:pointer;user-select:none;vertical-align:middle;';
      splitPill.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>
        </svg>
        <span>Split conversation</span>
      `;

      splitPill.onclick = () => {
        window.__threadlyAutoSplitNextReply = true;
        const replyBtn =
          actionBar.querySelector('span[role="link"]') ||
          actionBar.querySelector('[aria-label*="Reply"]');
        if (replyBtn) replyBtn.click();
        setTimeout(() => injectComposeToolbar(), 250);
      };

      actionBar.appendChild(splitPill);
    });

    // 2. Inject Full Compose Suite inside open Gmail Reply / Compose boxes
    const composeBoxes = document.querySelectorAll(
      'div.Am.Al.editable, div[g_editable="true"][role="textbox"], div[role="textbox"][aria-label*="Message"], div[role="textbox"][aria-label*="Reply"]'
    );
    composeBoxes.forEach(box => {
      const composeTable = box.closest('table.iN') || box.closest('table');
      const composeRoot =
        box.closest('.I5') ||
        box.closest('.ip.adB') ||
        box.closest('.M9') ||
        composeTable ||
        box.parentElement;
      if (!composeRoot || composeRoot.querySelector('.threadly-compose-bar')) return;

      const sendRowTr = composeRoot.querySelector('tr.btC');

      const startInSplit = Boolean(window.__threadlyAutoSplitNextReply);
      window.__threadlyAutoSplitNextReply = false;
      let isSplitting = startInSplit;
      let sendTargetStatus = 'Closed';

      // A. Top "Reply privately? Use Split conversation..." Banner aligned with the reply card
      const splitBanner = document.createElement('div');
      splitBanner.className = 'threadly-split-banner threadly-ext-root';
      splitBanner.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;padding:8px 14px;margin:0 0 8px 0;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;font-size:11.5px;color:#991B1B;box-sizing:border-box;';
      splitBanner.innerHTML = `
        <div>
          <strong>Reply privately?</strong> Use &ldquo;Split conversation&rdquo; to reply privately. If not, all responses on this email will be synced across all users of the shared mailbox.
          <button type="button" class="threadly-split-now-btn" style="background:none;border:none;color:#DC2626;font-weight:700;text-decoration:underline;cursor:pointer;margin-left:6px;">
            ${startInSplit ? 'Cancel split' : 'Split now'}
          </button>
        </div>
        <span class="threadly-split-badge" style="display:${
          startInSplit ? 'inline-block' : 'none'
        };background:#DC2626;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;white-space:nowrap;">
          Splitting Privately
        </span>
      `;
      if (composeTable && composeTable.parentElement) {
        composeTable.parentElement.insertBefore(splitBanner, composeTable);
      } else {
        composeRoot.prepend(splitBanner);
      }

      const splitNowBtn = splitBanner.querySelector('.threadly-split-now-btn');
      const splitBadge = splitBanner.querySelector('.threadly-split-badge');
      if (splitNowBtn) {
        splitNowBtn.onclick = () => {
          isSplitting = !isSplitting;
          splitNowBtn.textContent = isSplitting ? 'Cancel split' : 'Split now';
          if (splitBadge) splitBadge.style.display = isSplitting ? 'inline-block' : 'none';
        };
      }

      // B. Crimson Caution Banner placed inside the top of the editor area (.Ap) so tr.btC stays 100% inside the white card
      const cautionBanner = document.createElement('div');
      cautionBanner.className = 'threadly-caution-banner threadly-ext-root';
      cautionBanner.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;padding:7px 12px;margin:0 0 8px 0;background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;border-radius:6px;font-size:11.5px;box-sizing:border-box;';
      cautionBanner.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" style="flex-shrink:0;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span><strong>Be cautious about sharing sensitive information.</strong> ${customerEmail} is outside your organization and isn&apos;t in your contacts.</span>
        </div>
        <button type="button" class="threadly-close-caution" style="background:none;border:none;font-size:15px;font-weight:700;cursor:pointer;color:#991B1B;line-height:1;padding:0 4px;">&times;</button>
      `;
      cautionBanner.querySelector('.threadly-close-caution').onclick = () => cautionBanner.remove();

      if (box.parentElement) {
        box.parentElement.insertBefore(cautionBanner, box);
      }

      // C. Create the Expandable Bottom Feature Bar (HIDDEN by default; revealed ONLY when clicking the Red Hexagon dropdown button)
      const bar = document.createElement('div');
      bar.className = 'threadly-compose-bar threadly-ext-root';
      bar.style.cssText =
        'display:none;flex-direction:column;gap:8px;padding:10px 14px;margin-top:8px;background:#FFFFFF;border:1px solid #FECACA;font-size:12px;color:#0F172A;border-radius:10px;box-shadow:0 4px 12px rgba(220,38,38,0.08);position:relative;box-sizing:border-box;';
      bar.innerHTML = `
        <!-- Row 1: Below Features (Share Draft, Send Later, Email Templates, # Conversation ID, Customer Portal) -->
        <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding-bottom:8px;border-bottom:1px solid #FEE2E2;">
          <button type="button" class="threadly-bar-btn threadly-share-draft-btn" style="display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:#0F172A;cursor:pointer;font-size:12px;font-weight:500;padding:4px 8px;border-radius:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FEE2E2" stroke="#DC2626" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span>Share Draft</span>
          </button>

          <button type="button" class="threadly-bar-btn threadly-send-later-btn" style="display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:#0F172A;cursor:pointer;font-size:12px;font-weight:500;padding:4px 8px;border-radius:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FEE2E2" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Send Later</span>
          </button>

          <button type="button" class="threadly-bar-btn threadly-templates-btn" style="display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:#0F172A;cursor:pointer;font-size:12px;font-weight:500;padding:4px 8px;border-radius:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FEE2E2" stroke="#DC2626" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            <span>Email Templates</span>
          </button>

          <button type="button" class="threadly-bar-btn threadly-insert-id-btn" style="display:inline-flex;align-items:center;gap:5px;background:none;border:none;color:#0F172A;cursor:pointer;font-size:12px;font-weight:500;padding:4px 8px;border-radius:6px;">
            <span style="font-weight:700;color:#DC2626;">#</span>
            <span>Conversation ID</span>
          </button>

          <button type="button" class="threadly-bar-btn threadly-portal-btn" style="display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:#0F172A;cursor:pointer;font-size:12px;font-weight:500;padding:4px 8px;border-radius:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>Customer Portal</span>
          </button>
        </div>

        <!-- Row 2: Current AI & Split Features -->
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button type="button" class="t-cur-split" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">
            Reply Privately (Split Conversation)
          </button>
          <button type="button" class="t-cur-ai-pro" style="background:#FEF2F2;color:#991B1B;border:1px solid #FECACA;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">
            AI Smart Reply (Professional)
          </button>
          <button type="button" class="t-cur-ai-concise" style="background:#FEF2F2;color:#991B1B;border:1px solid #FECACA;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">
            AI Smart Reply (Concise)
          </button>
          <button type="button" class="t-cur-ai-sum" style="background:#FEF2F2;color:#991B1B;border:1px solid #FECACA;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">
            AI Summarize Thread to Note
          </button>
        </div>
      `;

      if (composeTable && composeTable.parentElement) {
        composeTable.parentElement.appendChild(bar);
      } else {
        composeRoot.appendChild(bar);
      }

      // Wire Row 2 (Current AI & Split Features)
      bar.querySelector('.t-cur-split').onclick = () => {
        if (splitNowBtn) splitNowBtn.click();
      };
      bar.querySelector('.t-cur-ai-pro').onclick = async () => {
        if (!activeConversation) await syncCurrentGmailThread();
        if (!activeConversation) return;
        const data = await apiCall(`/api/conversations/${activeConversation.id}/ai-reply`, 'POST', {
          mode: 'professional',
        });
        if (data && data.reply) box.innerText = data.reply;
      };
      bar.querySelector('.t-cur-ai-concise').onclick = async () => {
        if (!activeConversation) await syncCurrentGmailThread();
        if (!activeConversation) return;
        const data = await apiCall(`/api/conversations/${activeConversation.id}/ai-reply`, 'POST', {
          mode: 'concise',
        });
        if (data && data.reply) box.innerText = data.reply;
      };
      bar.querySelector('.t-cur-ai-sum').onclick = () => openAiModal();

      // D. Inject Crimson "Send & Close | v" + "[Red Hexagon | v]" + "[Person-Check Assign]" into tr.btC
      const sendBtnCell = composeRoot.querySelector('td.gU.Up') || (sendRowTr && sendRowTr.querySelector('td'));
      if (sendRowTr && sendBtnCell && !sendRowTr.querySelector('.threadly-inline-send-controls')) {
        const inlineTd = document.createElement('td');
        inlineTd.className = 'gU threadly-inline-send-controls threadly-ext-root';
        inlineTd.style.cssText =
          'padding:0 6px 0 8px;vertical-align:middle;white-space:nowrap;position:relative;';
        inlineTd.innerHTML = `
          <div style="display:inline-flex;align-items:center;gap:8px;vertical-align:middle;position:relative;">
            <!-- Crimson Send & Close Split Pill -->
            <div class="threadly-send-close-pill" style="display:inline-flex;align-items:center;background:#DC2626;color:#FFFFFF;border-radius:9999px;height:36px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 1px 2px rgba(220,38,38,0.2);overflow:hidden;">
              <span class="threadly-do-send-close" style="padding:0 14px;height:100%;display:inline-flex;align-items:center;">Send &amp; Close</span>
              <span style="height:20px;width:1px;background:rgba(255,255,255,0.45);"></span>
              <span class="threadly-do-send-close-chevron" title="Choose status on send" style="padding:0 10px;height:100%;display:inline-flex;align-items:center;">&#9662;</span>
            </div>

            <!-- Threadly Brand Dropdown Button (Toggles the Below Features + Current Features bar) -->
            <div class="threadly-hex-compose-btn" style="display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 9px;border:1px solid #FECACA;border-radius:6px;background:#FEF2F2;cursor:pointer;position:relative;" title="Click to toggle Share Draft, Send Later, Templates, Portal &amp; AI features">
              <svg width="17" height="17" viewBox="0 0 36 36" fill="none">
                <rect x="2" y="2" width="32" height="32" rx="9" fill="#DC2626"/>
                <path d="M10.5 12.5H25.5" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
                <path d="M18 12.5V22.5C18 24.9853 20.0147 27 22.5 27C24.433 27 26 25.433 26 23.5C26 21.567 24.433 20 22.5 20H14C11.7909 20 10 18.2091 10 16" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="25.5" cy="12.5" r="2.2" fill="#FECACA"/>
              </svg>
              <span style="font-size:10px;color:#DC2626;">&#9662;</span>
            </div>

            <!-- Person + Checkmark Quick Assign Icon -->
            <button type="button" class="threadly-assign-inline-btn" title="Assign conversation" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;background:transparent;color:#991B1B;border-radius:6px;cursor:pointer;position:relative;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <polyline points="16 11 18 13 22 9"/>
              </svg>
            </button>
          </div>
        `;
        sendRowTr.insertBefore(inlineTd, sendBtnCell.nextSibling);

        const closeMenus = () => {
          inlineTd.querySelectorAll('.threadly-floating-menu').forEach(m => m.remove());
        };

        // 1. Primary Send & <Status> action
        inlineTd.querySelector('.threadly-do-send-close').onclick = async () => {
          if (!activeConversation) await syncCurrentGmailThread();
          const bodyText = (box.innerText || '').trim();
          if (activeConversation && bodyText) {
            await apiCall(`/api/conversations/${activeConversation.id}/messages`, 'POST', {
              sender_name: getActiveActorName(),
              sender_email: activeUserEmail,
              recipient_email: activeConversation.customer_email,
              body: bodyText,
              is_agent_reply: 1,
              is_private_split: isSplitting ? 1 : 0,
              close_on_send: sendTargetStatus === 'Closed',
            });
          }
          if (activeConversation) {
            await apiCall(`/api/conversations/${activeConversation.id}`, 'PATCH', {
              status: sendTargetStatus,
              actor_name: getActiveActorName(),
            });
          }
          const gmailSendBtn = composeRoot.querySelector('div[role="button"][aria-label*="Send"]');
          if (gmailSendBtn) gmailSendBtn.click();
          syncCurrentGmailThread();
        };

        // 2. Send & Close Chevron Dropdown (Send & Close | Send & Pending | Send & Open)
        inlineTd.querySelector('.threadly-do-send-close-chevron').onclick = e => {
          e.stopPropagation();
          const existing = inlineTd.querySelector('.threadly-sc-menu');
          if (existing) {
            existing.remove();
            return;
          }
          closeMenus();
          const menu = document.createElement('div');
          menu.className = 'threadly-floating-menu threadly-sc-menu';
          menu.style.cssText =
            'position:absolute;bottom:42px;left:0;width:170px;background:#FFFFFF;border:1px solid #FECACA;border-radius:8px;box-shadow:0 10px 25px rgba(15,23,42,0.16);padding:6px;z-index:99999;font-size:12px;color:#0F172A;';
          menu.innerHTML = `
            <div class="t-sc-opt" data-st="Closed" data-label="Send & Close" style="padding:7px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
              <span>Send &amp; Close</span><span style="width:8px;height:8px;border-radius:9999px;background:#DC2626;"></span>
            </div>
            <div class="t-sc-opt" data-st="Pending" data-label="Send & Pending" style="padding:7px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
              <span>Send &amp; Pending</span><span style="width:8px;height:8px;border-radius:9999px;background:#B91C1C;"></span>
            </div>
            <div class="t-sc-opt" data-st="Open" data-label="Send & Open" style="padding:7px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
              <span>Send &amp; Open</span><span style="width:8px;height:8px;border-radius:9999px;background:#991B1B;"></span>
            </div>
          `;
          inlineTd.appendChild(menu);
          menu.querySelectorAll('.t-sc-opt').forEach(opt => {
            opt.onmouseenter = () => (opt.style.background = '#FEF2F2');
            opt.onmouseleave = () => (opt.style.background = 'transparent');
            opt.onclick = ev => {
              ev.stopPropagation();
              sendTargetStatus = opt.getAttribute('data-st');
              inlineTd.querySelector('.threadly-do-send-close').textContent =
                opt.getAttribute('data-label');
              menu.remove();
            };
          });
        };

        // 3. Clicking the Red Hexagon Dropdown Button reveals/toggles the Below Features + Current Features bar!
        inlineTd.querySelector('.threadly-hex-compose-btn').onclick = e => {
          e.stopPropagation();
          closeMenus();
          const isHidden = bar.style.display === 'none';
          bar.style.display = isHidden ? 'flex' : 'none';
          inlineTd.querySelector('.threadly-hex-compose-btn').style.background = isHidden
            ? '#FEE2E2'
            : '#FEF2F2';
          inlineTd.querySelector('.threadly-hex-compose-btn').style.borderColor = isHidden
            ? '#DC2626'
            : '#FECACA';
        };

        // 4. Person + Checkmark Quick Assign Menu
        inlineTd.querySelector('.threadly-assign-inline-btn').onclick = e => {
          e.stopPropagation();
          const existing = inlineTd.querySelector('.threadly-assign-menu');
          if (existing) {
            existing.remove();
            return;
          }
          closeMenus();
          const users = bootstrap.users || [];
          const menu = document.createElement('div');
          menu.className = 'threadly-floating-menu threadly-assign-menu';
          menu.style.cssText =
            'position:absolute;bottom:42px;left:185px;width:210px;background:#FFFFFF;border:1px solid #FECACA;border-radius:8px;box-shadow:0 10px 25px rgba(15,23,42,0.16);padding:6px;z-index:99999;font-size:12px;color:#0F172A;';
          menu.innerHTML = `
            <div style="padding:4px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#991B1B;">Assign Conversation To</div>
            ${users
              .map(
                u => `
              <div class="t-asgn-opt" data-uid="${u.id}" style="padding:7px 10px;border-radius:6px;cursor:pointer;">
                <div style="font-weight:600;">${u.name}</div>
                <div style="font-size:10px;color:#64748B;">${u.email}</div>
              </div>
            `
              )
              .join('')}
            <div class="t-asgn-opt" data-uid="" style="padding:7px 10px;border-radius:6px;cursor:pointer;color:#64748B;">Unassign</div>
          `;
          inlineTd.appendChild(menu);

          menu.querySelectorAll('.t-asgn-opt').forEach(opt => {
            opt.onmouseenter = () => (opt.style.background = '#FEF2F2');
            opt.onmouseleave = () => (opt.style.background = 'transparent');
            opt.onclick = async ev => {
              ev.stopPropagation();
              const uid = opt.getAttribute('data-uid');
              menu.remove();
              if (!activeConversation) await syncCurrentGmailThread();
              if (activeConversation) {
                const updated = await apiCall(
                  `/api/conversations/${activeConversation.id}`,
                  'PATCH',
                  {
                    assignee_id: uid ? Number(uid) : null,
                    actor_name: getActiveActorName(),
                  }
                );
                if (updated) {
                  activeConversation = updated;
                  renderSidebar();
                }
              }
              inlineTd.querySelector('.threadly-assign-inline-btn').style.color = '#DC2626';
            };
          });
        };
      }

      // 1. Share Draft Handler
      bar.querySelector('.threadly-share-draft-btn').onclick = async e => {
        const btn = e.currentTarget;
        if (!activeConversation) await syncCurrentGmailThread();
        if (activeConversation) {
          await apiCall(`/api/conversations/${activeConversation.id}/notes`, 'POST', {
            author_name: getActiveActorName(),
            body: `Shared live draft with teammate: "${(box.innerText || '').trim() || '(Draft opened)'}"`,
          });
          activeConversation = await apiCall(`/api/conversations/${activeConversation.id}`, 'GET');
          renderSidebar();
        }
        btn.style.color = '#DC2626';
        btn.querySelector('span').textContent = 'Draft Shared with Team';
      };

      // 2. Send Later Popover Handler (Quick presets + Custom Datetime)
      bar.querySelector('.threadly-send-later-btn').onclick = e => {
        e.stopPropagation();
        const existingPop = bar.querySelector('.threadly-ext-popover');
        if (existingPop) {
          existingPop.remove();
          return;
        }

        const pop = document.createElement('div');
        pop.className = 'threadly-ext-popover';
        pop.style.cssText =
          'position:absolute;bottom:52px;left:95px;width:275px;background:#FFFFFF;border:1px solid #FECACA;border-radius:10px;box-shadow:0 12px 28px rgba(15,23,42,0.18);padding:12px;z-index:99999;';
        pop.innerHTML = `
          <div style="font-weight:700;font-size:12px;color:#991B1B;margin-bottom:8px;">Schedule Send Later</div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
            <button type="button" class="t-sched-preset" data-hrs="2" style="text-align:left;padding:6px 8px;border:1px solid #FECACA;border-radius:6px;background:#FEF2F2;color:#991B1B;font-size:11px;cursor:pointer;">Later today (+2 hours)</button>
            <button type="button" class="t-sched-preset" data-hrs="24" style="text-align:left;padding:6px 8px;border:1px solid #FECACA;border-radius:6px;background:#FEF2F2;color:#991B1B;font-size:11px;cursor:pointer;">Tomorrow morning (9:00 AM)</button>
          </div>
          <input type="datetime-local" class="t-sched-input" style="width:100%;box-sizing:border-box;border:1px solid #FECACA;border-radius:6px;padding:6px 8px;font-size:11px;margin-bottom:8px;" />
          <div style="display:flex;justify-content:flex-end;gap:6px;">
            <button type="button" class="t-sched-cancel" style="background:none;border:none;font-size:11px;color:#64748B;cursor:pointer;">Cancel</button>
            <button type="button" class="t-sched-confirm threadly-btn-crimson" style="padding:5px 10px;font-size:11px;">Schedule</button>
          </div>
        `;
        bar.appendChild(pop);

        const doSchedule = async isoStr => {
          if (!activeConversation) await syncCurrentGmailThread();
          if (activeConversation) {
            const updated = await apiCall(
              `/api/conversations/${activeConversation.id}/messages`,
              'POST',
              {
                sender_name: getActiveActorName(),
                sender_email: activeUserEmail,
                recipient_email: activeConversation.customer_email,
                body: (box.innerText || '').trim() || 'Scheduled reply',
                is_agent_reply: 1,
                scheduled_for: isoStr,
              }
            );
            if (updated) {
              activeConversation = updated;
              renderSidebar();
            }
          }
          pop.remove();
          bar.querySelector('.threadly-send-later-btn span').textContent = 'Scheduled';
        };

        pop.querySelectorAll('.t-sched-preset').forEach(b => {
          b.onclick = () => {
            const hrs = Number(b.getAttribute('data-hrs') || 2);
            const dt = new Date(Date.now() + hrs * 3600 * 1000).toISOString();
            doSchedule(dt);
          };
        });
        pop.querySelector('.t-sched-cancel').onclick = () => pop.remove();
        pop.querySelector('.t-sched-confirm').onclick = () => {
          const dt = pop.querySelector('.t-sched-input').value;
          if (dt) doSchedule(dt);
        };
      };

      // 3. Email Templates Popover Handler
      bar.querySelector('.threadly-templates-btn').onclick = async e => {
        e.stopPropagation();
        const existingPop = bar.querySelector('.threadly-ext-popover');
        if (existingPop) {
          existingPop.remove();
          return;
        }
        const templates = bootstrap.templates || [];
        const pop = document.createElement('div');
        pop.className = 'threadly-ext-popover';
        pop.style.cssText =
          'position:absolute;bottom:52px;left:180px;width:340px;background:#FFFFFF;border:1px solid #FECACA;border-radius:10px;box-shadow:0 12px 28px rgba(15,23,42,0.18);padding:12px;z-index:99999;';
        pop.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="font-size:12px;color:#991B1B;">Email Templates</strong>
            <button type="button" class="t-tpl-close" style="background:none;border:none;cursor:pointer;font-size:14px;">&times;</button>
          </div>
          <input type="text" class="t-tpl-search" placeholder="Search templates..." style="width:100%;box-sizing:border-box;border:1px solid #FECACA;border-radius:6px;padding:6px 8px;font-size:11px;margin-bottom:8px;" />
          <div class="t-tpl-list" style="max-height:190px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
            ${
              templates.length === 0
                ? '<div style="font-size:11px;color:#64748B;">No templates found.</div>'
                : templates
                    .map(
                      (t, idx) => `
                  <div class="t-tpl-item" data-idx="${idx}" style="padding:8px;border:1px solid #FECACA;border-radius:6px;cursor:pointer;">
                    <div style="font-weight:600;font-size:11.5px;color:#0F172A;">${t.name}</div>
                    <div style="font-size:10.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.body}</div>
                  </div>
                `
                    )
                    .join('')
            }
          </div>
        `;
        bar.appendChild(pop);
        pop.querySelector('.t-tpl-close').onclick = () => pop.remove();

        pop.querySelectorAll('.t-tpl-item').forEach(item => {
          item.onmouseenter = () => (item.style.background = '#FEF2F2');
          item.onmouseleave = () => (item.style.background = '#FFFFFF');
          item.onclick = () => {
            const tpl = templates[Number(item.getAttribute('data-idx'))];
            if (tpl) {
              const cname = activeConversation?.customer_name || 'Customer';
              const text = tpl.body.replace(/\{\{customer_name\}\}/gi, cname);
              box.focus();
              box.innerText = box.innerText ? `${box.innerText}\n\n${text}` : text;
            }
            pop.remove();
          };
        });

        pop.querySelector('.t-tpl-search').oninput = ev => {
          const q = ev.target.value.toLowerCase();
          pop.querySelectorAll('.t-tpl-item').forEach(item => {
            const tpl = templates[Number(item.getAttribute('data-idx'))];
            const show =
              tpl.name.toLowerCase().includes(q) || tpl.body.toLowerCase().includes(q);
            item.style.display = show ? 'block' : 'none';
          });
        };
      };

      // 4. # Conversation ID Handler
      bar.querySelector('.threadly-insert-id-btn').onclick = () => {
        const currentCode = activeConversation?.conversation_code || convCode;
        box.focus();
        document.execCommand('insertText', false, ` [${currentCode}] `);
      };

      // 5. Customer Portal & Knowledge Base Handler
      bar.querySelector('.threadly-portal-btn').onclick = e => {
        e.stopPropagation();
        const existingPop = bar.querySelector('.threadly-ext-popover');
        if (existingPop) {
          existingPop.remove();
          return;
        }
        const currentCode = activeConversation?.conversation_code || convCode;
        const portalUrl = `${DASHBOARD_URL}/?thread=${encodeURIComponent(currentCode)}`;
        const pop = document.createElement('div');
        pop.className = 'threadly-ext-popover';
        pop.style.cssText =
          'position:absolute;bottom:52px;left:320px;width:300px;background:#FFFFFF;border:1px solid #FECACA;border-radius:10px;box-shadow:0 12px 28px rgba(15,23,42,0.18);padding:12px;z-index:99999;';
        pop.innerHTML = `
          <div style="font-weight:700;font-size:12px;color:#991B1B;margin-bottom:4px;">Customer Portal &amp; KB</div>
          <div style="font-size:11px;color:#64748B;margin-bottom:8px;">Insert self-service ticket tracking link into this reply:</div>
          <div style="padding:6px 8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;font-family:monospace;font-size:10.5px;color:#991B1B;margin-bottom:8px;word-break:break-all;">${portalUrl}</div>
          <div style="display:flex;justify-content:space-between;gap:6px;">
            <button type="button" class="t-portal-insert threadly-btn-crimson" style="flex:1;padding:6px;font-size:11px;">Insert Portal Link</button>
            <button type="button" class="t-portal-open" style="padding:6px 10px;border:1px solid #FECACA;background:#FEF2F2;color:#DC2626;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Open Portal</button>
          </div>
        `;
        bar.appendChild(pop);
        pop.querySelector('.t-portal-insert').onclick = () => {
          box.focus();
          const text = `\nTrack your ticket status online: ${portalUrl}`;
          box.innerText = box.innerText ? `${box.innerText}${text}` : text.trim();
          pop.remove();
        };
        pop.querySelector('.t-portal-open').onclick = () => {
          window.open(portalUrl, '_blank');
          pop.remove();
        };
      };
    });
  }

  // Render immediately & observe Gmail DOM
  injectLeftSidebar();
  renderTopWidget();
  renderSidebar();
  refreshBootstrap();
  setTimeout(() => syncVisibleGmailListRows(true), 1500);

  const observer = new MutationObserver(() => {
    if (!document.getElementById('threadly-left-nav-container')) {
      injectLeftSidebar();
    }
    syncCurrentGmailThread();
    syncVisibleGmailListRows(false);
    injectComposeToolbar();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
