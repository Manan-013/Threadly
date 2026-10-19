import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Menu,
  Search,
  SlidersHorizontal,
  HelpCircle,
  Settings,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Archive,
  AlertOctagon,
  Trash2,
  Mail,
  Clock,
  CheckSquare,
  FolderInput,
  Tag,
  Share2,
  Eye,
  Wand2,
  Printer,
  ExternalLink,
  Star,
  Reply,
  ReplyAll,
  Forward,
  MoreVertical,
  FileEdit,
  Hash,
  Globe,
  Inbox,
  MessageSquare,
  Phone,
  Plus,
  BarChart3,
  Shield,
  CheckCircle2,
  Circle,
  Sparkles,
  Send,
  User,
  LogOut,
} from 'lucide-react';
import { ThreadlyHexIcon } from './components/ThreadlyBrandIcon';
import { RightCollaborationPanel } from './components/RightCollaborationPanel';
import { AnalyticsModal } from './components/AnalyticsModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import {
  ShareConversationModal,
  AiSummarizerModal,
  CreateTemplateModal,
  CustomerPortalModal,
  NewConversationModal,
} from './components/ConversationModals';
import { AuthScreen } from './components/AuthScreen';
import { SharedThreadView } from './components/SharedThreadView';

export const App: React.FC = () => {
  const [bootstrap, setBootstrap] = useState<any>({
    setup: { completedCount: 0, totalCount: 5, steps: [] },
    users: [],
    inboxes: [],
    tags: [],
    customFields: [],
    slaPolicies: [],
    automations: [],
    templates: [],
    dashboards: [],
    customReports: [],
    connectors: [],
    webhooks: [],
    chatbots: [],
    settings: {},
  });

  // Current operator state
  // `me` is the authenticated user (from the session token). `activeUserId` is only the
  // assignee filter used by the "Mine" / "Team" views; it is never used as an identity.
  const [me, setMe] = useState<any | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const sharedToken = new URLSearchParams(window.location.search).get('shared');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [operatorStatus, setOperatorStatus] = useState<'Active' | 'Away' | 'Offline'>('Active');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showSetupPopover, setShowSetupPopover] = useState(false);
  const [showHexMenu, setShowHexMenu] = useState(false);

  // Navigation & Filters
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [selectedInboxId, setSelectedInboxId] = useState<number | null>(null);
  const [selectedView, setSelectedView] = useState<string>('all');
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Conversations & Active Thread
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Compose & Shared Draft state (Screenshot 000437 & 000449)
  const [composeOpen, setComposeOpen] = useState(true);
  const [draftBody, setDraftBody] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [draftTo, setDraftTo] = useState('');
  const [isSplitPrivate, setIsSplitPrivate] = useState(false);
  const [showCautionBanner, setShowCautionBanner] = useState(true);
  const [showSplitBanner, setShowSplitBanner] = useState(true);
  const [isSharedDraftActive, setIsSharedDraftActive] = useState(false);
  const [sharedDraftEditor, setSharedDraftEditor] = useState('');

  // Compose Toolbar Popovers
  const [showTemplatesPopover, setShowTemplatesPopover] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCatFilter, setTemplateCatFilter] = useState('All');
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [showSendLaterPopover, setShowSendLaterPopover] = useState(false);
  const [sendLaterDateTime, setSendLaterDateTime] = useState('');
  const [showComposeHexMenu, setShowComposeHexMenu] = useState(false);
  const [leftSlideoverMode, setLeftSlideoverMode] = useState<'team' | 'all_views' | 'tags' | null>(
    null
  );
  const [slideoverSearch, setSlideoverSearch] = useState('');

  // Top-level Modals
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminInitialSection, setAdminInitialSection] = useState('home');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showWatchersPopover, setShowWatchersPopover] = useState(false);
  const [showSnoozePopover, setShowSnoozePopover] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [newConvDefaultChannel, setNewConvDefaultChannel] = useState('email');
  const [customerReplyInput, setCustomerReplyInput] = useState('');
  const [showCustomerReplySimulator, setShowCustomerReplySimulator] = useState(false);
  const [showGmailSyncModal, setShowGmailSyncModal] = useState(false);
  const [googleOAuthStatus, setGoogleOAuthStatus] = useState<{
    isConfigured: boolean;
    connected: boolean;
    account: { email: string; name: string; avatarUrl: string } | null;
  }>({ isConfigured: false, connected: false, account: null });
  const [gmailSyncLoading, setGmailSyncLoading] = useState(false);
  const [gmailSyncResult, setGmailSyncResult] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const activeConvIdRef = useRef<number | null>(null);

  const isEmbedded = typeof window !== 'undefined' && (
    window.self !== window.top ||
    new URLSearchParams(window.location.search).get('embedded') === '1'
  );

  useEffect(() => {
    if (!isEmbedded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.parent.postMessage({ type: 'THREADLY_CLOSE_EMBED' }, '*');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEmbedded]);

  const currentUser = me ? bootstrap.users.find((u: any) => u.id === me.id) || me : null;
  const currentUserName = currentUser ? currentUser.name : 'Guest';
  const isAdmin = me?.role === 'Admin';

  // Resolve the session once on load; a missing/expired token falls through to the login screen.
  useEffect(() => {
    const token = localStorage.getItem('threadly_auth_token');
    if (!token) {
      setAuthChecked(true);
      return;
    }
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) {
          setMe(data.user);
          setActiveUserId(data.user.id);
        } else {
          localStorage.removeItem('threadly_auth_token');
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  // main.tsx dispatches this when the API answers 401 (expired or revoked session).
  useEffect(() => {
    const onUnauthorized = () => {
      setMe(null);
      setActiveUserId(null);
    };
    window.addEventListener('threadly:unauthorized', onUnauthorized);
    return () => window.removeEventListener('threadly:unauthorized', onUnauthorized);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {
      // Offline: the token is still discarded locally below.
    }
    localStorage.removeItem('threadly_auth_token');
    window.location.reload(); // drops every in-memory conversation of the previous user
  };

  const fetchBootstrap = async () => {
    const res = await fetch('/api/bootstrap');
    if (!res.ok) return;
    const data = await res.json();
    setBootstrap(data);
    const params = new URLSearchParams(window.location.search);
    const urlAssignee = params.get('assignee_id');
    const urlInbox = params.get('inbox_id');
    if (urlAssignee) {
      setActiveUserId(Number(urlAssignee));
    }
    if (urlInbox) {
      setSelectedInboxId(Number(urlInbox));
    } else if (!selectedInboxId && data.inboxes.length > 0 && !params.get('view')) {
      setSelectedInboxId(data.inboxes[0].id);
    }
  };

  const fetchConversations = async () => {
    const params = new URLSearchParams();
    if (selectedInboxId && selectedView !== 'assigned_to_me' && selectedView !== 'following') {
      params.set('inbox_id', String(selectedInboxId));
    }
    if (selectedView && selectedView !== 'all') params.set('view', selectedView);
    if (activeUserId) params.set('assignee_id', String(activeUserId));
    if (selectedTagId) params.set('tag_id', String(selectedTagId));
    if (channelFilter) params.set('channel', channelFilter);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());

    const res = await fetch(`/api/conversations?${params.toString()}`);
    if (!res.ok) return;
    const list = await res.json();
    setConversations(list);
  };

  const openConversation = async (convId: number) => {
    const res = await fetch(`/api/conversations/${convId}`);
    if (!res.ok) return;
    const full = await res.json();
    setActiveConversation(full);
    activeConvIdRef.current = full.id;
    setDraftTo(full.shared_draft?.to_email || full.customer_email);
    setDraftBody(full.shared_draft?.body || '');
    setIsSplitPrivate(full.shared_draft?.is_split_private === 1);
    setIsSharedDraftActive(Boolean(full.shared_draft?.body));
    setSharedDraftEditor(full.shared_draft?.updated_by_name || '');
    setComposeOpen(true);

    if (socketRef.current) {
      socketRef.current.emit('join_conversation', { conversationId: full.id });
    }
  };

  useEffect(() => {
    if (!me) return;
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view');
    const urlInbox = params.get('inbox_id');
    const urlAssignee = params.get('assignee_id');
    const urlTag = params.get('tag_id');
    const urlModal = params.get('modal');

    if (urlView) setSelectedView(urlView);
    if (urlInbox) setSelectedInboxId(Number(urlInbox));
    if (urlAssignee) setActiveUserId(Number(urlAssignee));
    if (urlTag) setSelectedTagId(Number(urlTag));

    if (urlModal === 'analytics') {
      setShowAnalyticsModal(true);
    } else if (urlModal === 'templates') {
      setShowCreateTemplateModal(true);
    } else if (urlModal === 'contacts') {
      setAdminInitialSection('users');
      setShowAdminModal(true);
    } else if (urlModal === 'admin') {
      setAdminInitialSection('home');
      setShowAdminModal(true);
    }

    fetchBootstrap();

    const fetchOAuthStatus = async () => {
      try {
        const res = await fetch('/api/auth/google/status');
        const data = await res.json();
        setGoogleOAuthStatus(data);
      } catch (_) {}
    };
    fetchOAuthStatus();

    if (params.get('auth_success')) {
      setShowGmailSyncModal(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Internal permalink (?thread=<conversation code>): requires the signed-in user's session.
    const threadCode = params.get('thread');
    if (threadCode) {
      fetch(`/api/conversations/by-code/${encodeURIComponent(threadCode)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(conv => {
          if (conv && conv.id) openConversation(conv.id);
        })
        .catch(() => {});
    }
    const token = localStorage.getItem('threadly_auth_token');
    const socket = io(window.location.origin.includes('localhost:5173') ? 'http://localhost:4000' : window.location.origin, {
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect_error', err => {
      if (err.message === 'Authentication failed') {
        window.dispatchEvent(new Event('threadly:unauthorized'));
      }
    });

    socket.on('oauth_connected', () => {
      fetchOAuthStatus();
      fetchConversations();
    });

    socket.on('oauth_disconnected', () => {
      fetchOAuthStatus();
    });

    socket.on('conversation_updated', (updated: any) => {
      fetchConversations();
      fetchBootstrap();
      if (activeConvIdRef.current === updated.id) {
        setActiveConversation(updated);
      }
    });

    socket.on('conversation_list_invalidated', () => {
      fetchConversations();
      fetchBootstrap();
    });

    socket.on('conversation_created', () => {
      fetchConversations();
      fetchBootstrap();
    });

    socket.on('setup_updated', (setup: any) => {
      setBootstrap((prev: any) => ({ ...prev, setup }));
    });

    socket.on('presence_updated', ({ conversationId, presence }: any) => {
      if (activeConvIdRef.current === conversationId) {
        setActiveConversation((prev: any) => (prev ? { ...prev, presence } : prev));
      }
    });

    socket.on('shared_draft_synced', (draft: any) => {
      if (activeConvIdRef.current === draft.conversation_id) {
        setDraftBody(draft.body);
        setDraftTo(draft.to_email);
        setIsSplitPrivate(draft.is_split_private === 1);
        setIsSharedDraftActive(true);
        setSharedDraftEditor(draft.updated_by_name);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [me?.id]);

  useEffect(() => {
    if (me) fetchConversations();
  }, [me?.id, selectedInboxId, selectedView, selectedTagId, channelFilter, searchQuery, activeUserId]);

  const handleUpdateConversation = async (patch: any) => {
    if (!activeConversation) return;
    const res = await fetch(`/api/conversations/${activeConversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, actor_name: currentUserName }),
    });
    const updated = await res.json();
    setActiveConversation(updated);
    fetchConversations();
    fetchBootstrap();
  };

  const handleAddTag = async (tagId?: number, tagName?: string) => {
    if (!activeConversation) return;
    const res = await fetch(`/api/conversations/${activeConversation.id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tagId, tag_name: tagName, actor_name: currentUserName }),
    });
    const updated = await res.json();
    setActiveConversation(updated);
    fetchConversations();
    fetchBootstrap();
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!activeConversation) return;
    const res = await fetch(
      `/api/conversations/${activeConversation.id}/tags/${tagId}?actor_name=${encodeURIComponent(
        currentUserName
      )}`,
      { method: 'DELETE' }
    );
    const updated = await res.json();
    setActiveConversation(updated);
    fetchConversations();
  };

  const handleAddNote = async (body: string, isAiSummary = false) => {
    if (!activeConversation) return;
    const res = await fetch(`/api/conversations/${activeConversation.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: currentUser?.id || null,
        author_name: currentUserName,
        body,
        is_ai_summary: isAiSummary ? 1 : 0,
      }),
    });
    const updated = await res.json();
    setActiveConversation(updated);
  };

  const handleDraftChange = (newText: string) => {
    setDraftBody(newText);
    if (activeConversation && socketRef.current) {
      socketRef.current.emit('typing_status', {
        conversationId: activeConversation.id,
        isTyping: newText.length > 0,
      });
      socketRef.current.emit('shared_draft_change', {
        conversationId: activeConversation.id,
        toEmail: draftTo || activeConversation.customer_email,
        body: newText,
        isSplitPrivate,
        updatedByName: currentUserName,
      });
    }
  };

  const handleSendReply = async (closeOnSend = false, scheduledFor: string | null = null) => {
    if (!activeConversation || !draftBody.trim()) return;
    setSendError(null);
    // The sender comes from your session and the mailbox is the connected Gmail account; only the
    // customer of this conversation can be the recipient (the server rejects anything else).
    const res = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_email: draftTo || activeConversation.customer_email,
        body: draftBody.trim(),
        is_agent_reply: 1,
        is_private_split: isSplitPrivate ? 1 : 0,
        scheduled_for: scheduledFor,
        close_on_send: closeOnSend,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setActiveConversation(data);
    } else {
      setSendError(data.error || 'The message could not be sent.');
      if (res.status !== 502) return; // rejected before saving: keep the draft so it can be fixed
      // 502: saved but not delivered. It now shows as "Not delivered" with a Retry button.
      if (data.conversation) setActiveConversation(data.conversation);
    }
    setDraftBody('');
    setIsSharedDraftActive(false);
    setShowSendLaterPopover(false);
    fetchConversations();
    fetchBootstrap();
  };

  const handleRetryMessage = async (messageId: number) => {
    setSendError(null);
    const res = await fetch(`/api/messages/${messageId}/retry`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setActiveConversation(data);
    } else {
      setSendError(data.error || 'Retry failed.');
      if (data.conversation) setActiveConversation(data.conversation);
    }
    fetchConversations();
  };

  const handleCustomerIncomingReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversation || !customerReplyInput.trim()) return;
    const res = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: customerReplyInput.trim(),
        is_agent_reply: 0,
      }),
    });
    const updated = await res.json();
    setActiveConversation(updated);
    setCustomerReplyInput('');
    setShowCustomerReplySimulator(false);
    fetchConversations();
  };

  const handleOpenAiSummarizer = async () => {
    if (!activeConversation) return;
    setShowAiModal(true);
    setAiLoading(true);
    const res = await fetch(`/api/conversations/${activeConversation.id}/ai-summarize`, {
      method: 'POST',
    });
    const data = await res.json();
    setAiSummaryText(data.summary || '');
    setAiLoading(false);
  };

  const handleSmartCompose = async (mode: string) => {
    if (!activeConversation) return;
    const res = await fetch(`/api/conversations/${activeConversation.id}/ai-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (data.reply) {
      handleDraftChange(data.reply);
    }
  };

  const filteredTemplates = (bootstrap.templates || []).filter((t: any) => {
    const matchesCat = templateCatFilter === 'All' || t.category === templateCatFilter;
    const matchesSearch =
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.body.toLowerCase().includes(templateSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const applyTemplateToDraft = (tpl: any) => {
    const replaced = tpl.body.replace(
      /\{\{customer_name\}\}/gi,
      activeConversation?.customer_name || 'there'
    );
    handleDraftChange(draftBody ? `${draftBody}\n\n${replaced}` : replaced);
    setShowTemplatesPopover(false);
  };

  const otherViewers = (activeConversation?.presence || []).filter(
    (p: any) => p.socketId !== socketRef.current?.id
  );

  // Public share links are read-only and need no account.
  if (sharedToken) {
    return <SharedThreadView token={sharedToken} />;
  }

  if (!authChecked) {
    return <div className="min-h-screen bg-[#F8FAFC]" />;
  }

  if (!currentUser) {
    return (
      <AuthScreen
        onAuthenticated={(user: any, token: string) => {
          localStorage.setItem('threadly_auth_token', token);
          setMe(user);
          setActiveUserId(user.id);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] overflow-hidden">
      {/* TOP GMAIL + THREADLY HEADER BAR (Matches Screenshot 000429.png & 000547.png) */}
      <header className="h-14 bg-[#F8FAFC] border-b border-[#E2E8F0] px-4 flex items-center justify-between shrink-0">
        {/* Left: Back to Gmail (if embedded) + Menu + Brand Logo + Search */}
        <div className="flex items-center gap-3 flex-1 max-w-3xl">
          {isEmbedded && (
            <button
              onClick={() => {
                window.parent.postMessage({ type: 'THREADLY_CLOSE_EMBED' }, '*');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-semibold shadow-sm transition-all shrink-0 cursor-pointer"
              title="Return to regular Gmail view (or press Esc)"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span>Back to Gmail</span>
            </button>
          )}

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-full hover:bg-[#E2E8F0]/60 text-[#475569]"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={() => setActiveConversation(null)}
            className="flex items-center gap-2.5 cursor-pointer pr-4 select-none"
          >
            <ThreadlyHexIcon size={28} />
            <span className="font-brand text-[19px] text-[#0F172A] tracking-tight">
              Thread<span className="text-[#DC2626]">ly</span>
            </span>
          </div>

          {/* Search Mail Bar */}
          <div className="flex-1 max-w-xl relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search mail, conversation ID (2446-0001), or customer..."
              className="w-full bg-[#EEF2F6] focus:bg-white border border-transparent focus:border-[#CBD5E1] focus:shadow-sm rounded-full pl-10 pr-10 py-2 text-xs text-[#0F172A] placeholder-[#64748B] focus:outline-none transition-[background-color,border-color,box-shadow] duration-150"
            />
            <SlidersHorizontal className="w-4 h-4 text-[#64748B] absolute right-3.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Right: Active Status Pill + Icons + Threadly Hexagon + Threadly Setup X/5 + User */}
        <div className="flex items-center gap-2.5">
          {/* Active Status Pill matching Screenshot 000429.png */}
          <div className="relative">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E2E8F0] hover:bg-[#F1F5F9] text-xs font-medium text-[#0F172A] shadow-sm"
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  operatorStatus === 'Active'
                    ? 'bg-[#16A34A]'
                    : operatorStatus === 'Away'
                    ? 'bg-[#D97706]'
                    : 'bg-[#94A3B8]'
                }`}
              />
              <span>{operatorStatus}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
            </button>

            {showStatusDropdown && (
              <div className="threadly-popover-top-right absolute right-0 mt-1.5 w-36 bg-white border border-[#E2E8F0] rounded-lg py-1 z-30">
                {(['Active', 'Away', 'Offline'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => {
                      setOperatorStatus(st);
                      setShowStatusDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#F8FAFC] flex items-center gap-2"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        st === 'Active'
                          ? 'bg-[#16A34A]'
                          : st === 'Away'
                          ? 'bg-[#D97706]'
                          : 'bg-[#94A3B8]'
                      }`}
                    />
                    <span>{st}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setGmailSyncResult(null);
              setShowGmailSyncModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-[11px] font-semibold text-[#DC2626] transition-colors"
            title="Sync all Received (Inbox) & Sent emails from Gmail"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Sync Gmail</span>
          </button>

          <button
            onClick={() => setShowPortalModal(true)}
            className="p-2 rounded-full hover:bg-[#E2E8F0]/60 text-[#475569]"
            title="Customer Portal & Knowledge Base"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setAdminInitialSection('settings');
              setShowAdminModal(true);
            }}
            className="p-2 rounded-full hover:bg-[#E2E8F0]/60 text-[#475569]"
            title="Automations & SLA Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowAnalyticsModal(true)}
            className="p-2 rounded-full hover:bg-[#E2E8F0]/60 text-[#475569]"
            title="Threadly Analytics"
          >
            <BarChart3 className="w-4 h-4 text-[#DC2626]" />
          </button>

          <button
            onClick={() => setShowNewConvModal(true)}
            className="p-2 rounded-full hover:bg-[#E2E8F0]/60 text-[#475569] relative"
            title="Receive / Create Conversation"
          >
            <Bell className="w-4 h-4" />
            <span className="w-2 h-2 rounded-full bg-[#DC2626] absolute top-1.5 right-1.5" />
          </button>

          {/* Threadly Hexagon Launcher matching Screenshot 000429.png */}
          <div className="relative">
            <button
              onClick={() => setShowHexMenu(!showHexMenu)}
              className="p-1.5 rounded-full hover:bg-[#FEF2F2] transition-colors"
              title="Threadly Hub"
            >
              <ThreadlyHexIcon size={22} />
            </button>

            {showHexMenu && (
              <div className="threadly-popover-top-right absolute right-0 mt-2 w-52 bg-white border border-[#E2E8F0] rounded-xl py-1.5 z-40">
                <button
                  onClick={() => {
                    setShowHexMenu(false);
                    setAdminInitialSection('home');
                    setShowAdminModal(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-[#FEF2F2] hover:text-[#991B1B] font-medium flex items-center gap-2.5"
                >
                  <Shield className="w-4 h-4 text-[#DC2626]" />
                  <span>Admin Panel</span>
                </button>
                <button
                  onClick={() => {
                    setShowHexMenu(false);
                    setShowAnalyticsModal(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-[#FEF2F2] hover:text-[#991B1B] font-medium flex items-center gap-2.5"
                >
                  <BarChart3 className="w-4 h-4 text-[#DC2626]" />
                  <span>Analytics &amp; Dashboards</span>
                </button>
                <button
                  onClick={() => {
                    setShowHexMenu(false);
                    setShowPortalModal(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-[#FEF2F2] hover:text-[#991B1B] font-medium flex items-center gap-2.5"
                >
                  <Globe className="w-4 h-4 text-[#DC2626]" />
                  <span>Knowledge Base &amp; Portal</span>
                </button>
                <div className="my-1 border-t border-[#F1F5F9]" />
                <button
                  onClick={() => {
                    setShowHexMenu(false);
                    setShowNewConvModal(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-[#FEF2F2] text-[#DC2626] font-semibold flex items-center gap-2.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>New / Inbound Conversation</span>
                </button>
              </div>
            )}
          </div>

          {/* Threadly Setup X/5 done widget matching Screenshot 000400.png & 000429.png */}
          <div className="relative">
            <button
              onClick={() => setShowSetupPopover(!showSetupPopover)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-white border border-transparent hover:border-[#E2E8F0] transition-colors"
            >
              <div className="relative w-6 h-6 flex items-center justify-center">
                <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="2.5"
                    strokeDasharray={56.5}
                    strokeDashoffset={
                      56.5 - (56.5 * (bootstrap.setup?.completedCount || 0)) / 5
                    }
                  />
                </svg>
              </div>
              <div className="text-left leading-tight">
                <div className="text-[11px] font-semibold text-[#0F172A]">Threadly Setup</div>
                <div className="text-[10px] text-[#64748B] tabular-nums">
                  {bootstrap.setup?.completedCount || 0}/5 done
                </div>
              </div>
            </button>

            {showSetupPopover && (
              <div className="threadly-popover-top-right absolute right-0 mt-2 w-72 bg-white border border-[#E2E8F0] rounded-xl p-4 z-40">
                <div className="text-xs font-semibold text-[#0F172A] mb-2 tabular-nums">
                  Workspace Setup Checklist ({bootstrap.setup?.completedCount || 0}/5)
                </div>
                <div className="space-y-2">
                  {(bootstrap.setup?.steps || []).map((st: any) => (
                    <button
                      key={st.id}
                      onClick={() => {
                        setShowSetupPopover(false);
                        if (st.id === 'inbox') {
                          setAdminInitialSection('inboxes');
                          setShowAdminModal(true);
                        } else if (st.id === 'user') {
                          setAdminInitialSection('users');
                          setShowAdminModal(true);
                        } else if (st.id === 'tag') {
                          setAdminInitialSection('tags');
                          setShowAdminModal(true);
                        } else if (st.id === 'automation') {
                          setAdminInitialSection('settings');
                          setShowAdminModal(true);
                        } else {
                          setShowNewConvModal(true);
                        }
                      }}
                      className="w-full flex items-center gap-2.5 text-left p-2 rounded-md hover:bg-[#F8FAFC] text-xs"
                    >
                      {st.done ? (
                        <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-[#CBD5E1] shrink-0" />
                      )}
                      <span className={st.done ? 'line-through text-[#64748B]' : 'text-[#0F172A]'}>
                        {st.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Active User / Profile Menu Popover with Log Out */}
          <div className="relative">
            {currentUser ? (
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] transition-colors"
                title="Account & Log Out"
              >
                <div className="w-6 h-6 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  {currentUserName.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-[11px] font-semibold text-[#0F172A]">{currentUser.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
              </button>
            ) : null}

            {showUserMenu && (
              <div className="threadly-popover-top-right absolute right-0 mt-2 w-64 bg-white border border-[#E2E8F0] rounded-xl shadow-xl py-2 z-50 text-xs">
                {currentUser && (
                  <>
                    {/* User Profile Card */}
                    <div className="px-3 py-2 border-b border-[#F1F5F9] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#DC2626] text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {currentUserName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-bold text-[#0F172A] truncate">{currentUser.name}</div>
                        <div className="text-[11px] text-[#64748B] truncate">{currentUser.email}</div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-[#FEF2F2] text-[#991B1B] text-[9px] font-bold">
                          {currentUser.role || 'Admin'}
                        </span>
                      </div>
                    </div>

                    <div className="my-1 border-t border-[#F1F5F9]" />

                    {/* Log Out Button */}
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 text-[#DC2626] hover:bg-[#FEF2F2] font-semibold transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out of Workspace</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* FAR-LEFT GMAIL CHANNEL RAIL (Mail, Chat, WhatsApp, Voice) */}
        <div className="w-16 bg-[#F1F5F9] border-r border-[#E2E8F0] flex flex-col items-center py-3 gap-4 shrink-0">
          {[
            { id: '', label: 'Mail', icon: Mail, inboxType: 'email' },
            { id: 'chat', label: 'Chat', icon: MessageSquare, inboxType: 'chat' },
            { id: 'whatsapp', label: 'WhatsApp', icon: Globe, inboxType: 'whatsapp' },
            { id: 'voice', label: 'Voice', icon: Phone, inboxType: 'voice' },
          ].map(ch => {
            const Icon = ch.icon;
            const active = channelFilter === ch.id;
            return (
              <button
                key={ch.label}
                onClick={async () => {
                  setChannelFilter(ch.id);
                  setSelectedView('all');
                  setSelectedTagId(null);
                  const matchingInbox = bootstrap.inboxes.find(
                    (ib: any) => ib.channel_type === ch.inboxType
                  );
                  const nextInboxId = matchingInbox ? matchingInbox.id : null;
                  setSelectedInboxId(nextInboxId);
                  activeConvIdRef.current = null;
                  setActiveConversation(null);

                  const params = new URLSearchParams();
                  if (nextInboxId) params.set('inbox_id', String(nextInboxId));
                  if (ch.id) params.set('channel', ch.id);
                  const res = await fetch(`/api/conversations?${params.toString()}`);
                  const list = await res.json();
                  setConversations(list);
                  if (list.length > 0) {
                    openConversation(list[0].id);
                  }
                }}
                className="flex flex-col items-center gap-1 group"
              >
                <div
                  className={`w-10 h-7 rounded-full flex items-center justify-center transition-colors ${
                    active
                      ? 'bg-[#FECACA] text-[#991B1B]'
                      : 'text-[#475569] group-hover:bg-[#E2E8F0]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-medium text-[#334155]">{ch.label}</span>
              </button>
            );
          })}
        </div>

        {/* LEFT SHARED INBOXES & VIEWS NAVIGATION (1:1 Hiver layout in Enterprise Crimson) */}
        {sidebarOpen && (
          <aside className="w-60 bg-[#F8FAFC] border-r border-[#E2E8F0] flex flex-col py-3 px-2 overflow-y-auto shrink-0 relative select-none">
            {/* Compose Button */}
            <button
              onClick={() => {
                setNewConvDefaultChannel(channelFilter || 'email');
                setShowNewConvModal(true);
              }}
              className="mx-2 mb-3 flex items-center gap-3 py-2.5 px-4 rounded-2xl bg-white hover:bg-[#FEF2F2] border border-[#E2E8F0] hover:border-[#FECACA] text-[#0F172A] text-xs font-semibold shadow-sm transition-colors"
            >
              <FileEdit className="w-4 h-4 text-[#DC2626]" />
              <span>Compose</span>
            </button>

            {/* Primary Gmail Folders */}
            <div className="space-y-0.5 mb-1">
              {[
                { id: 'received', label: 'Inbox', count: bootstrap.inboxes[0]?.counts?.total || 1 },
                { id: 'all', label: 'Starred' },
                { id: 'snoozed', label: 'Snoozed' },
                { id: 'sent', label: 'Sent' },
                { id: 'drafts', label: 'Drafts' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedView(item.id === 'drafts' ? 'all' : item.id);
                    setSelectedTagId(null);
                    setLeftSlideoverMode(null);
                    setActiveConversation(null);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-1.5 rounded-full text-xs transition-colors ${
                    selectedView === item.id && !selectedTagId && !leftSlideoverMode
                      ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                      : 'text-[#202124] hover:bg-[#EAEBEF]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Inbox className="w-3.5 h-3.5 text-[#475569]" />
                    <span>{item.label}</span>
                  </span>
                  {item.count !== undefined && (
                    <span className="text-[11px] font-semibold tabular-nums">{item.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Threadly Full Production Left Navigation (Enterprise Crimson) */}
            <div className="space-y-0.5">
              {/* Assigned to me */}
              <button
                onClick={() => {
                  setSelectedView('assigned_to_me');
                  setSelectedTagId(null);
                  setLeftSlideoverMode(null);
                  activeConvIdRef.current = null;
                  setActiveConversation(null);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-full text-xs transition-colors ${
                  selectedView === 'assigned_to_me' && !selectedTagId && !leftSlideoverMode
                    ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                    : 'text-[#202124] hover:bg-[#EAEBEF]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="w-3 inline-block shrink-0" />
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                    <circle cx="12" cy="8" r="4" fill="#FFFFFF" />
                    <path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5Z" fill="#FCA5A5" stroke="#202124" />
                  </svg>
                  <span>Assigned to me</span>
                </span>
                <span className="text-[11px] font-semibold tabular-nums">
                  {currentUser?.assigned_count || 0}
                </span>
              </button>

              {/* Following */}
              <button
                onClick={() => {
                  setSelectedView('following');
                  setSelectedTagId(null);
                  setLeftSlideoverMode(null);
                  activeConvIdRef.current = null;
                  setActiveConversation(null);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-full text-xs transition-colors ${
                  selectedView === 'following' && !selectedTagId && !leftSlideoverMode
                    ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                    : 'text-[#202124] hover:bg-[#EAEBEF]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="w-3 inline-block shrink-0" />
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" fill="#FFFFFF" />
                    <circle cx="12" cy="12" r="3" fill="#FCA5A5" stroke="#202124" />
                  </svg>
                  <span>Following</span>
                </span>
                {currentUser?.following_count > 0 && (
                  <span className="text-[11px] font-semibold tabular-nums">{currentUser.following_count}</span>
                )}
              </button>

              {/* Real Shared Inboxes from SQLite filtered by active channel */}
              {bootstrap.inboxes
                .filter((ib: any) =>
                  !channelFilter
                    ? !ib.channel_type || ib.channel_type === 'email'
                    : ib.channel_type === channelFilter
                )
                .map((ib: any) => {
                  const isSelectedInbox = selectedInboxId === ib.id;
                  const mineCount = currentUser ? ib.counts?.by_user?.[currentUser.id] || 0 : 0;
                  return (
                    <div key={ib.id} className="space-y-0.5">
                    <button
                      onClick={() => {
                        setSelectedInboxId(isSelectedInbox ? null : ib.id);
                        setChannelFilter(ib.channel_type === 'email' ? '' : ib.channel_type);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-full text-xs font-medium text-[#202124] hover:bg-[#EAEBEF] transition-colors"
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <span className="text-[10px] text-[#5F6368] w-3 text-center shrink-0">
                          {isSelectedInbox ? '▾' : '▸'}
                        </span>
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                          <path d="M4 5h16l2 8v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6l2-8Z" fill="#FFFFFF" />
                          <path d="M2 13h6l2 3h4l2-3h6v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6Z" fill="#FCA5A5" stroke="#202124" />
                        </svg>
                        <span className="truncate">{ib.name}</span>
                      </span>
                    </button>

                    {isSelectedInbox && (
                      <div className="pl-7 space-y-0.5">
                        {/* Unassigned */}
                        <button
                          onClick={() => {
                            setSelectedInboxId(ib.id);
                            setSelectedView('unassigned');
                            setSelectedTagId(null);
                            setLeftSlideoverMode(null);
                            activeConvIdRef.current = null;
                            setActiveConversation(null);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-xs transition-colors ${
                            selectedView === 'unassigned' && !selectedTagId && !leftSlideoverMode
                              ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                              : 'text-[#202124] hover:bg-[#EAEBEF]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <Mail className="w-3.5 h-3.5 text-[#202124] shrink-0" />
                            <span>Unassigned</span>
                          </span>
                          <span className="text-[11px] font-semibold tabular-nums">
                            {ib.counts?.unassigned || 0}
                          </span>
                        </button>

                        {/* Mine */}
                        <button
                          onClick={() => {
                            setSelectedInboxId(ib.id);
                            setSelectedView('mine');
                            setSelectedTagId(null);
                            setLeftSlideoverMode(null);
                            activeConvIdRef.current = null;
                            setActiveConversation(null);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-xs transition-colors ${
                            selectedView === 'mine' && !selectedTagId && !leftSlideoverMode
                              ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                              : 'text-[#202124] hover:bg-[#EAEBEF]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                              <circle cx="12" cy="8" r="4" />
                              <path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5Z" />
                            </svg>
                            <span>Mine</span>
                          </span>
                          {mineCount > 0 && (
                            <span className="text-[11px] font-semibold tabular-nums">{mineCount}</span>
                          )}
                        </button>

                        {/* Team -> Opens Team Slide-over */}
                        <button
                          onClick={() => {
                            setSelectedInboxId(ib.id);
                            setSlideoverSearch('');
                            setLeftSlideoverMode(leftSlideoverMode === 'team' ? null : 'team');
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-xs transition-colors ${
                            leftSlideoverMode === 'team'
                              ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                              : 'text-[#202124] hover:bg-[#EAEBEF]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                              <circle cx="9" cy="8" r="3.5" />
                              <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5Z" fill="#FCA5A5" />
                              <circle cx="17" cy="9" r="2.5" />
                            </svg>
                            <span>Team</span>
                          </span>
                        </button>

                        {/* All views -> Opens All views Slide-over */}
                        <button
                          onClick={() => {
                            setSelectedInboxId(ib.id);
                            setSlideoverSearch('');
                            setLeftSlideoverMode(
                              leftSlideoverMode === 'all_views' ? null : 'all_views'
                            );
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-xs transition-colors ${
                            leftSlideoverMode === 'all_views'
                              ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                              : 'text-[#202124] hover:bg-[#EAEBEF]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                              <rect x="6" y="6" width="14" height="14" rx="2" fill="#FFFFFF" />
                              <path d="M4 16V5a1 1 0 0 1 1-1h11" />
                            </svg>
                            <span>All views</span>
                          </span>
                        </button>

                        {/* Tags -> Opens Tags Slide-over */}
                        <button
                          onClick={() => {
                            setSelectedInboxId(ib.id);
                            setSlideoverSearch('');
                            setLeftSlideoverMode(leftSlideoverMode === 'tags' ? null : 'tags');
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-xs transition-colors ${
                            leftSlideoverMode === 'tags'
                              ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                              : 'text-[#202124] hover:bg-[#EAEBEF]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                            </svg>
                            <span>Tags</span>
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Analytics */}
              <button
                onClick={() => setShowAnalyticsModal(true)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-full text-xs text-[#202124] hover:bg-[#EAEBEF] transition-colors"
              >
                <span className="w-3 inline-block shrink-0" />
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                  <path d="M22 12A10 10 0 0 0 12 2v10z" fill="#FCA5A5" stroke="#202124" />
                </svg>
                <span>Analytics</span>
              </button>

              {/* Email Templates */}
              <button
                onClick={() => setShowCreateTemplateModal(true)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-full text-xs text-[#202124] hover:bg-[#EAEBEF] transition-colors"
              >
                <span className="w-3 inline-block shrink-0" />
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                  <rect x="3" y="6" width="18" height="14" rx="2" fill="#FFFFFF" />
                  <path d="m3 8 9 6 9-6" fill="#FCA5A5" />
                </svg>
                <span>Email Templates</span>
              </button>

              {/* Contacts */}
              <button
                onClick={() => {
                  setAdminInitialSection('users');
                  setShowAdminModal(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-full text-xs text-[#202124] hover:bg-[#EAEBEF] transition-colors"
              >
                <span className="w-3 inline-block shrink-0" />
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="1.8">
                  <rect x="4" y="3" width="16" height="18" rx="2" fill="#FCA5A5" />
                  <circle cx="12" cy="10" r="2.5" fill="#FFFFFF" />
                </svg>
                <span>Contacts</span>
              </button>

              {/* Admin Panel */}
              <button
                onClick={() => {
                  setAdminInitialSection('home');
                  setShowAdminModal(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-full text-xs text-[#202124] hover:bg-[#EAEBEF] transition-colors"
              >
                <span className="w-3 inline-block shrink-0" />
                <Shield className="w-4 h-4 text-[#DC2626] shrink-0" />
                <span>Admin Panel</span>
              </button>
            </div>

            {/* SLIDE-OVER DRAWER FOR TEAM / ALL VIEWS / TAGS */}
            {leftSlideoverMode && (
              <div className="threadly-drawer-left absolute inset-0 bg-white z-30 p-3 flex flex-col border-r border-[#E2E8F0]">
                <div className="flex items-center justify-between pb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                    <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                    <span>
                      {leftSlideoverMode === 'team'
                        ? 'Team'
                        : leftSlideoverMode === 'all_views'
                        ? bootstrap.inboxes.find((i: any) => i.id === selectedInboxId)?.name ||
                          'Main Shared Inbox'
                        : 'Tags'}
                    </span>
                  </div>
                  <button
                    onClick={() => setLeftSlideoverMode(null)}
                    className="text-[#64748B] hover:text-[#0F172A] text-base leading-none"
                  >
                    &times;
                  </button>
                </div>

                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={slideoverSearch}
                    onChange={e => setSlideoverSearch(e.target.value)}
                    placeholder="Search"
                    className="w-full pl-8 pr-2.5 py-1.5 border border-[#CBD5E1] rounded-md text-xs focus:outline-none focus:border-[#DC2626]"
                  />
                </div>

                {leftSlideoverMode === 'team' && (
                  <div className="space-y-1 overflow-y-auto">
                    <button
                      onClick={() => {
                        setSelectedView('team');
                        setLeftSlideoverMode(null);
                        activeConvIdRef.current = null;
                        setActiveConversation(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#FEE2E2] text-[#991B1B] text-xs font-semibold"
                    >
                      <span className="w-6 h-6 rounded-full bg-[#FCA5A5] text-[#991B1B] flex items-center justify-center text-[10px] font-bold">
                        All
                      </span>
                      <span>All assignees</span>
                    </button>
                    {bootstrap.users
                      .filter((u: any) =>
                        u.name.toLowerCase().includes(slideoverSearch.toLowerCase())
                      )
                      .map((u: any) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setActiveUserId(u.id);
                            setSelectedView('mine');
                            setLeftSlideoverMode(null);
                            activeConvIdRef.current = null;
                            setActiveConversation(null);
                          }}
                          className="w-full flex items-center justify-between px-3 py-1.5 rounded-full hover:bg-[#FEF2F2] text-[#0F172A] text-xs font-medium"
                        >
                          <span className="flex items-center gap-2.5 truncate">
                            <span className="w-6 h-6 rounded-full bg-[#DC2626] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                              {u.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate">{u.name}</span>
                          </span>
                          <span className="text-[11px] font-semibold text-[#64748B] tabular-nums">
                            {u.assigned_count || 0}
                          </span>
                        </button>
                      ))}
                  </div>
                )}

                {leftSlideoverMode === 'all_views' && (
                  <div className="space-y-1 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 pb-1">
                      <span className="text-[11px] font-semibold text-[#DC2626]">All views</span>
                      <button
                        onClick={() => {
                          setAdminInitialSection('inboxes');
                          setShowAdminModal(true);
                        }}
                        className="w-6 h-4 rounded-full border border-[#FECACA] text-[#DC2626] text-xs font-bold flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    {[
                      {
                        id: 'open',
                        label: 'All unresolved',
                        count: bootstrap.inboxes[0]?.counts?.open || 0,
                        starred: false,
                      },
                      {
                        id: 'unassigned',
                        label: 'Unassigned',
                        count: bootstrap.inboxes[0]?.counts?.unassigned || 0,
                        starred: true,
                      },
                      {
                        id: 'mine',
                        label: 'Mine',
                        count: currentUser
                          ? bootstrap.inboxes[0]?.counts?.by_user?.[currentUser.id] || 0
                          : 0,
                        starred: true,
                      },
                      {
                        id: 'team',
                        label: 'Team',
                        count: bootstrap.inboxes[0]?.counts?.assigned_total || 0,
                        starred: true,
                      },
                      {
                        id: 'pending',
                        label: 'Pending',
                        count: bootstrap.inboxes[0]?.counts?.pending || 0,
                        starred: false,
                      },
                      {
                        id: 'closed',
                        label: 'Closed',
                        count: bootstrap.inboxes[0]?.counts?.closed || 0,
                        starred: false,
                      },
                    ]
                      .filter(v => v.label.toLowerCase().includes(slideoverSearch.toLowerCase()))
                      .map(v => (
                        <button
                          key={v.id + v.label}
                          onClick={() => {
                            setSelectedView(v.id);
                            setLeftSlideoverMode(null);
                            activeConvIdRef.current = null;
                            setActiveConversation(null);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-xs ${
                            selectedView === v.id
                              ? 'bg-[#FEE2E2] text-[#991B1B] font-semibold'
                              : 'text-[#202124] hover:bg-[#FEF2F2]'
                          }`}
                        >
                          <span>{v.label}</span>
                          <span className="flex items-center gap-2">
                            {v.starred && <span className="text-[#DC2626] text-xs">&#9733;</span>}
                            {v.count !== undefined && (
                              <span className="text-[11px] font-semibold tabular-nums">{v.count}</span>
                            )}
                          </span>
                        </button>
                      ))}
                  </div>
                )}

                {leftSlideoverMode === 'tags' && (
                  <div className="space-y-1 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 pb-1">
                      <span className="text-[11px] font-semibold text-[#DC2626]">Shared Tags</span>
                      <button
                        onClick={() => {
                          setAdminInitialSection('tags');
                          setShowAdminModal(true);
                        }}
                        className="w-6 h-4 rounded-full border border-[#FECACA] text-[#DC2626] text-xs font-bold flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    {bootstrap.tags
                      .filter((t: any) =>
                        t.name.toLowerCase().includes(slideoverSearch.toLowerCase())
                      )
                      .map((t: any) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTagId(t.id);
                            setLeftSlideoverMode(null);
                            activeConvIdRef.current = null;
                            setActiveConversation(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[#FEF2F2] text-xs text-[#0F172A]"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
                          <span className="truncate">{t.name}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* CENTER WORKSPACE: CONVERSATION LIST OR ACTIVE THREAD VIEW */}
        <main className="flex-1 bg-white flex flex-col overflow-hidden">
          {!activeConversation ? (
            /* INBOX CONVERSATION LIST */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="h-12 border-b border-[#E2E8F0] px-4 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                  <span>
                    {bootstrap.inboxes.find((i: any) => i.id === selectedInboxId)?.name ||
                      'All Shared Inboxes'}
                  </span>
                  <span className="text-[#94A3B8]">&middot;</span>
                  <span className="capitalize text-[#64748B]">
                    {selectedView.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="text-xs font-mono tabular-nums text-[#64748B]">
                  {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
                </div>
              </div>

              {conversations.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center mb-3">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#0F172A]">
                    No conversations in this view yet
                  </h3>
                  <p className="text-xs text-[#64748B] max-w-md mt-1 mb-4">
                    Threadly starts with a clean database and zero mock data. Create a Shared
                    Inbox, Automation, or receive a new conversation to see real-time assignment,
                    SLA timers, internal notes, and AI summarization in action.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowNewConvModal(true)}
                      className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded-md shadow-sm"
                    >
                      + Create / Receive Conversation
                    </button>
                    <button
                      onClick={() => {
                        setAdminInitialSection('home');
                        setShowAdminModal(true);
                      }}
                      className="px-4 py-2 border border-[#CBD5E1] hover:border-[#DC2626] text-xs font-medium text-[#0F172A] rounded-md"
                    >
                      Open Admin Panel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
                  {conversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => openConversation(conv.id)}
                      className="threadly-row-interactive px-4 py-3 cursor-pointer flex items-center justify-between gap-4 transition-colors duration-100"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="font-mono tabular-nums text-[11px] text-[#64748B] shrink-0">
                          #{conv.conversation_code}
                        </span>
                        <span className="text-xs font-semibold text-[#0F172A] w-40 truncate shrink-0">
                          {conv.customer_name}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {(conv.tags || []).map((t: any) => (
                            <span
                              key={t.id}
                              className="px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0"
                              style={{
                                borderColor: t.color,
                                color: t.color,
                                backgroundColor: `${t.color}12`,
                              }}
                            >
                              {t.name}
                            </span>
                          ))}
                          <span className="text-xs font-semibold text-[#0F172A] truncate">
                            {conv.subject}
                          </span>
                          {conv.snippet && (
                            <span className="text-xs text-[#64748B] truncate">
                              &mdash; {conv.snippet}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {conv.assignee_name ? (
                          <span className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[11px] font-medium text-[#334155]">
                            {conv.assignee_name.split(' ')[0]}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-[#FEF2F2] text-[11px] font-medium text-[#DC2626]">
                            Unassigned
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            conv.status === 'Open'
                              ? 'bg-[#DC2626] text-white'
                              : conv.status === 'Pending'
                              ? 'bg-[#D97706] text-white'
                              : 'bg-[#059669] text-white'
                          }`}
                        >
                          {conv.status}
                        </span>
                        <span className="text-[11px] text-[#64748B] tabular-nums w-16 text-right">
                          {new Date(conv.updated_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* OPEN CONVERSATION THREAD VIEW (Exact match to Screenshot 000429, 000437, 000449, 000539) */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Top Thread Action Toolbar matching Screenshot 000429.png */}
              <div className="h-12 border-b border-[#E2E8F0] px-4 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-3 text-[#475569]">
                  <button
                    onClick={() => setActiveConversation(null)}
                    className="p-1.5 hover:bg-[#F1F5F9] rounded-full"
                    title="Back to inbox"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleUpdateConversation({ status: 'Closed' })}
                    className="p-1.5 hover:bg-[#F1F5F9] rounded-full"
                    title="Archive / Close"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 hover:bg-[#F1F5F9] rounded-full" title="Report">
                    <AlertOctagon className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 hover:bg-[#F1F5F9] rounded-full" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="h-4 w-px bg-[#E2E8F0]" />

                  {/* Snooze Clock */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSnoozePopover(!showSnoozePopover)}
                      className="p-1.5 hover:bg-[#F1F5F9] rounded-full"
                      title="Snooze conversation"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    {showSnoozePopover && (
                      <div className="threadly-popover-top-left absolute left-0 mt-1.5 w-48 bg-white border border-[#E2E8F0] rounded-lg py-1 z-30">
                        <button
                          onClick={() => {
                            const t = new Date(Date.now() + 4 * 3600000).toISOString();
                            handleUpdateConversation({ snoozed_until: t });
                            setShowSnoozePopover(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#F8FAFC]"
                        >
                          Snooze for 4 hours
                        </button>
                        <button
                          onClick={() => {
                            const t = new Date(Date.now() + 24 * 3600000).toISOString();
                            handleUpdateConversation({ snoozed_until: t });
                            setShowSnoozePopover(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#F8FAFC]"
                        >
                          Snooze until tomorrow
                        </button>
                      </div>
                    )}
                  </div>

                  <button className="p-1.5 hover:bg-[#F1F5F9] rounded-full" title="Add to tasks">
                    <CheckSquare className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 hover:bg-[#F1F5F9] rounded-full" title="Move to">
                    <FolderInput className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 hover:bg-[#F1F5F9] rounded-full" title="Labels">
                    <Tag className="w-4 h-4" />
                  </button>

                  <div className="h-4 w-px bg-[#E2E8F0]" />

                  {/* THREADLY SPECIFIC THREAD TOOLBAR ICONS (Share, Watchers, AI Summarizer) */}
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="p-1.5 rounded-full bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
                    title="Share this conversation (Permalink & ID)"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setShowWatchersPopover(!showWatchersPopover)}
                      className="p-1.5 rounded-full bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
                      title="Watchers / Collaborators"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {showWatchersPopover && (
                      <div className="threadly-popover-top-left absolute left-0 mt-1.5 w-56 bg-white border border-[#E2E8F0] rounded-lg p-3 z-30">
                        <div className="text-xs font-semibold text-[#0F172A] mb-2">
                          Conversation Watchers
                        </div>
                        {bootstrap.users.map((u: any) => {
                          const watching = (activeConversation.watchers || []).some(
                            (w: any) => w.id === u.id
                          );
                          return (
                            <label
                              key={u.id}
                              className="flex items-center gap-2 py-1 text-xs cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={watching}
                                onChange={async () => {
                                  const res = await fetch(
                                    `/api/conversations/${activeConversation.id}/watchers`,
                                    {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ user_id: u.id }),
                                    }
                                  );
                                  setActiveConversation(await res.json());
                                }}
                                className="accent-[#DC2626]"
                              />
                              <span>{u.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleOpenAiSummarizer}
                    className="p-1.5 rounded-full bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
                    title="AI Summarizer"
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Right Pagination & Sidebar Toggle */}
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <span>1 of { Math.max(1, conversations.length) }</span>
                  <ChevronLeft className="w-4 h-4" />
                  <ChevronRight className="w-4 h-4" />
                  <button
                    onClick={() => setShowRightPanel(!showRightPanel)}
                    className="ml-2 p-1 rounded-full bg-[#FEF2F2] hover:bg-[#FEE2E2]"
                    title="Toggle Threadly Sidebar"
                  >
                    <ThreadlyHexIcon size={20} />
                  </button>
                </div>
              </div>

              {/* Real-Time Collision Detection Banner */}
              {otherViewers.length > 0 && (
                <div className="bg-[#FEF2F2] border-b border-[#FECACA] px-6 py-2 text-xs text-[#991B1B] flex items-center justify-between">
                  <span>
                    <strong>Collision Detection:</strong>{' '}
                    {otherViewers.map((v: any) => v.userName).join(', ')}{' '}
                    {otherViewers.some((v: any) => v.isTyping)
                      ? 'is currently typing a reply on this thread'
                      : 'is viewing this conversation'}
                  </span>
                </div>
              )}

              {/* Scrollable Thread Content */}
              <div className="flex-1 overflow-y-auto px-8 py-5 space-y-6">
                {/* Subject & Gmail/Threadly System Label Pills matching Screenshot 000429.png */}
                <div>
                  <div className="flex items-center justify-between">
                    <h1 className="text-xl font-normal text-[#0F172A]">
                      {activeConversation.subject}
                    </h1>
                    <div className="flex items-center gap-2 text-[#64748B]">
                      <button
                        onClick={() => setShowCustomerReplySimulator(!showCustomerReplySimulator)}
                        className="px-2.5 py-1 rounded border border-[#E2E8F0] hover:border-[#DC2626] text-[11px] font-medium text-[#334155]"
                      >
                        + Receive Customer Reply
                      </button>
                      <Printer className="w-4 h-4" />
                      <ExternalLink className="w-4 h-4" />
                    </div>
                  </div>

                  {/* System Label Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded bg-[#E2E8F0] text-[11px] text-[#334155]">
                      Inbox &times;
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#E2E8F0] text-[11px] text-[#334155]">
                      Threadly-{activeConversation.inbox_name?.toLowerCase().replace(/\s+/g, '') || 'inbox'} &times;
                    </span>
                    {activeConversation.assignee_name && (
                      <span className="px-2 py-0.5 rounded bg-[#E2E8F0] text-[11px] text-[#334155]">
                        Threadly-assignee/{activeConversation.assignee_name.split(' ')[0].toLowerCase()} &times;
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-[#E2E8F0] text-[11px] text-[#334155]">
                      Threadly-status/{activeConversation.status.toLowerCase()} &times;
                    </span>
                    {(activeConversation.tags || []).map((t: any) => (
                      <span
                        key={t.id}
                        className="px-2 py-0.5 rounded bg-[#E2E8F0] text-[11px] text-[#334155]"
                      >
                        Threadly-tag/t-{t.name.toLowerCase().replace(/\s+/g, '-')} &times;
                      </span>
                    ))}
                  </div>
                </div>

                {/* Incoming Customer Reply Simulator (for testing AI Thank-You Auto-Closer & Threading) */}
                {showCustomerReplySimulator && (
                  <form
                    onSubmit={handleCustomerIncomingReply}
                    className="p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg space-y-2"
                  >
                    <div className="text-xs font-semibold text-[#0F172A]">
                      Receive Incoming Reply from {activeConversation.customer_name} (
                      {activeConversation.customer_email})
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customerReplyInput}
                        onChange={e => setCustomerReplyInput(e.target.value)}
                        placeholder='Type customer reply (e.g. "Thanks!" to test AI Thank-You Auto-Closer)...'
                        className="flex-1 border border-[#E2E8F0] bg-white rounded px-3 py-1.5 text-xs"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 bg-[#DC2626] text-white text-xs font-medium rounded"
                      >
                        Receive Message
                      </button>
                    </div>
                  </form>
                )}

                {/* Messages List */}
                <div className="space-y-5">
                  {(activeConversation.messages || []).map((msg: any) => (
                    <div key={msg.id} className="flex items-start gap-3.5">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ${
                          msg.is_agent_reply
                            ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                            : 'bg-[#DBEAFE] text-[#1D4ED8]'
                        }`}
                      >
                        {msg.sender_name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold text-[#0F172A]">
                              {msg.sender_name}
                            </span>{' '}
                            <span className="text-xs text-[#64748B]">&lt;{msg.sender_email}&gt;</span>
                            {msg.is_private_split === 1 && (
                              <span className="ml-2 px-2 py-0.5 rounded bg-[#FEF2F2] text-[10px] font-semibold text-[#DC2626]">
                                Split Private Reply
                              </span>
                            )}
                            {msg.status === 'scheduled' && (
                              <span className="ml-2 px-2 py-0.5 rounded bg-[#FEF3C7] text-[10px] font-semibold text-[#D97706]">
                                Scheduled
                              </span>
                            )}
                            {msg.status === 'sending' && (
                              <span className="ml-2 px-2 py-0.5 rounded bg-[#E0F2FE] text-[10px] font-semibold text-[#0369A1]">
                                Sending…
                              </span>
                            )}
                            {msg.status === 'failed' && (
                              <span className="ml-2 px-2 py-0.5 rounded bg-[#FEE2E2] text-[10px] font-semibold text-[#B91C1C]">
                                Not delivered
                              </span>
                            )}
                            <div className="text-[11px] text-[#64748B]">
                              to {msg.recipient_email}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[#64748B]">
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <Star className="w-3.5 h-3.5" />
                            <Reply className="w-3.5 h-3.5" />
                            <MoreVertical className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        <div className="mt-2.5 text-xs text-[#0F172A] whitespace-pre-line leading-relaxed">
                          {msg.body}
                        </div>
                        {msg.status === 'failed' && (
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-[#B91C1C]">
                            <span>{msg.error || 'Delivery failed.'}</span>
                            {msg.delivery_mode === 'server' && (
                              <button
                                onClick={() => handleRetryMessage(msg.id)}
                                className="px-2 py-0.5 rounded border border-[#FECACA] hover:bg-[#FEF2F2] font-semibold"
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {sendError && (
                  <div
                    role="alert"
                    className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]"
                  >
                    {sendError}
                  </div>
                )}

                {/* Reply / Reply All / Forward Pill Buttons matching Screenshot 000429.png */}
                {!composeOpen && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => setComposeOpen(true)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full border border-[#CBD5E1] hover:bg-[#F8FAFC] text-xs font-medium text-[#334155]"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>Reply</span>
                    </button>
                    <button
                      onClick={() => setComposeOpen(true)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full border border-[#CBD5E1] hover:bg-[#F8FAFC] text-xs font-medium text-[#334155]"
                    >
                      <ReplyAll className="w-3.5 h-3.5" />
                      <span>Reply all</span>
                    </button>
                    <button
                      onClick={() => setComposeOpen(true)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full border border-[#CBD5E1] hover:bg-[#F8FAFC] text-xs font-medium text-[#334155]"
                    >
                      <Forward className="w-3.5 h-3.5" />
                      <span>Forward</span>
                    </button>
                  </div>
                )}

                {/* ENHANCED COMPOSE BOX (Exact match to Screenshot 000437.png & 000449.png) */}
                {composeOpen && (
                  <div className="space-y-2 pt-2">
                    {/* Shared Draft status text matching Screenshot 000449.png */}
                    {isSharedDraftActive && (
                      <div className="text-[11px] text-[#64748B] flex items-center gap-1.5">
                        <span>
                          You are editing a shared draft. Changes are synced across all users in
                          real time
                          {sharedDraftEditor ? ` (Last edited by ${sharedDraftEditor})` : ''}.
                        </span>
                      </div>
                    )}

                    {/* Reply privately? Split conversation banner matching Screenshot 000437.png */}
                    {showSplitBanner && (
                      <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2.5 flex items-start justify-between">
                        <div className="text-xs text-[#7F1D1D]">
                          <div className="font-semibold">Reply privately?</div>
                          <div className="mt-0.5 text-[11px]">
                            Use &ldquo;Split conversation&rdquo; to reply privately. If not, all
                            responses on this email will be synced across all users of the shared
                            mailbox.{' '}
                            <button
                              onClick={() => setIsSplitPrivate(!isSplitPrivate)}
                              className="underline font-semibold text-[#DC2626]"
                            >
                              {isSplitPrivate ? 'Cancel split' : 'Split now'}
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowSplitBanner(false)}
                          className="text-[#991B1B] hover:text-[#7F1D1D]"
                        >
                          &times;
                        </button>
                      </div>
                    )}

                    {/* Main Compose Card */}
                    <div className="border border-[#CBD5E1] rounded-xl shadow-sm bg-white overflow-visible">
                      {/* Recipient Row */}
                      <div className="px-4 py-2.5 border-b border-[#F1F5F9] flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-[#334155] flex-1">
                          <Reply className="w-3.5 h-3.5 text-[#64748B]" />
                          <input
                            type="text"
                            value={draftTo}
                            onChange={e => setDraftTo(e.target.value)}
                            className="font-medium text-[#0F172A] underline decoration-[#DC2626] focus:outline-none flex-1"
                          />
                          {isSplitPrivate && (
                            <span className="px-2 py-0.5 rounded bg-[#FEF2F2] text-[10px] font-semibold text-[#DC2626]">
                              Splitting Privately
                            </span>
                          )}
                        </div>

                        {/* AI Smart Reply Quick Buttons */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleSmartCompose('professional')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[11px] font-medium text-[#DC2626]"
                            title="Draft reply with Threadly AI"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>AI Draft</span>
                          </button>
                          <button
                            onClick={() => handleSmartCompose('concise')}
                            className="px-2 py-1 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[11px] text-[#475569]"
                          >
                            Concise
                          </button>
                        </div>
                      </div>

                      {/* Textarea */}
                      <div className="p-4">
                        <textarea
                          rows={4}
                          value={draftBody}
                          onChange={e => handleDraftChange(e.target.value)}
                          placeholder="Write your reply..."
                          className="w-full text-xs text-[#0F172A] focus:outline-none resize-none"
                        />
                      </div>

                      {/* Caution Banner matching Screenshot 000437.png */}
                      {showCautionBanner && (
                        <div className="mx-3 mb-2 bg-[#FEF2F2] border border-[#FCA5A5] rounded px-3 py-2 flex items-center justify-between text-[11px] text-[#991B1B]">
                          <div>
                            <strong>Be cautious about sharing sensitive information.</strong>{' '}
                            {activeConversation.customer_email} is outside your organization and
                            isn&apos;t in your contacts.
                          </div>
                          <button
                            onClick={() => setShowCautionBanner(false)}
                            className="text-[#991B1B] font-bold ml-2"
                          >
                            &times;
                          </button>
                        </div>
                      )}

                      {/* Primary Send & Send & Close Button Row matching Screenshot 000437.png */}
                      <div className="px-4 py-2.5 flex items-center justify-between border-t border-[#F1F5F9]">
                        <div className="flex items-center gap-2">
                          {/* Send Button */}
                          <button
                            onClick={() => handleSendReply(false)}
                            className="px-4 py-1.5 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-medium flex items-center gap-1.5"
                          >
                            <span>Send</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Send & Close Button */}
                          <button
                            onClick={() => handleSendReply(true)}
                            className="px-4 py-1.5 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium flex items-center gap-1.5"
                          >
                            <span>Send &amp; Close</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Threadly Hexagon Action Button */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowComposeHexMenu(!showComposeHexMenu)}
                              className={`px-2 py-1.5 rounded border border-[#FECACA] ${
                                showComposeHexMenu ? 'bg-[#FEE2E2]' : 'bg-[#FEF2F2]'
                              } hover:bg-[#FEE2E2] flex items-center gap-1 cursor-pointer`}
                              title="Toggle Threadly Compose Features"
                            >
                              <ThreadlyHexIcon size={16} />
                              <ChevronDown className="w-3 h-3 text-[#DC2626]" />
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            handleDraftChange('');
                            setIsSharedDraftActive(false);
                          }}
                          className="p-1.5 text-[#64748B] hover:text-[#DC2626]"
                          title="Discard draft"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* BOTTOM THREADLY COMPOSE BAR - Toggled by clicking the Red Hexagon Dropdown Button */}
                      {showComposeHexMenu && (
                        <div className="threadly-compose-tray px-4 py-2.5 bg-[#FEF2F2] border-t border-[#FECACA] rounded-b-xl flex flex-col gap-2 text-xs text-[#991B1B] relative">
                          {/* Row 1: Share Draft | Send Later | Email Templates | # Conversation ID | Customer Portal */}
                          <div className="flex items-center flex-wrap gap-5">
                            <button
                              onClick={() => {
                                setIsSharedDraftActive(true);
                                handleDraftChange(draftBody || ' ');
                              }}
                              className="flex items-center gap-1.5 text-[#991B1B] hover:text-[#DC2626] font-semibold"
                            >
                              <FileEdit className="w-3.5 h-3.5 text-[#DC2626]" />
                              <span>{isSharedDraftActive ? 'Save Draft' : 'Share Draft'}</span>
                            </button>

                            {/* Send Later */}
                            <div className="relative">
                              <button
                                onClick={() => setShowSendLaterPopover(!showSendLaterPopover)}
                                className="flex items-center gap-1.5 text-[#991B1B] hover:text-[#DC2626] font-semibold"
                              >
                                <Clock className="w-3.5 h-3.5 text-[#DC2626]" />
                                <span>Send Later</span>
                              </button>
                              {showSendLaterPopover && (
                                <div className="threadly-popover-bottom-left absolute bottom-8 left-0 w-64 bg-white border border-[#FECACA] rounded-lg p-3 z-30 space-y-2">
                                  <div className="text-xs font-semibold text-[#991B1B]">
                                    Schedule Send Later
                                  </div>
                                  <input
                                    type="datetime-local"
                                    value={sendLaterDateTime}
                                    onChange={e => setSendLaterDateTime(e.target.value)}
                                    className="w-full border border-[#FECACA] rounded px-2 py-1 text-xs text-[#0F172A]"
                                  />
                                  <button
                                    onClick={() => {
                                      if (sendLaterDateTime) {
                                        // datetime-local carries no timezone: send an absolute instant so the server schedules it correctly.
                                        handleSendReply(false, new Date(sendLaterDateTime).toISOString());
                                      }
                                    }}
                                    className="w-full py-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded flex items-center justify-center gap-1"
                                  >
                                    <Send className="w-3 h-3" /> Schedule Reply
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Email Templates Popover */}
                            <div className="relative">
                              <button
                                onClick={() => setShowTemplatesPopover(!showTemplatesPopover)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded font-semibold ${
                                  showTemplatesPopover
                                    ? 'bg-[#FEE2E2] text-[#991B1B]'
                                    : 'text-[#991B1B] hover:text-[#DC2626]'
                                }`}
                              >
                                <Mail className="w-3.5 h-3.5 text-[#DC2626]" />
                                <span>Email Templates</span>
                              </button>

                              {showTemplatesPopover && (
                                <div className="threadly-popover-bottom-left absolute bottom-9 left-0 w-72 bg-white border border-[#FECACA] rounded-xl p-4 z-40">
                                  <div className="flex items-center justify-between mb-2.5">
                                    <span className="text-xs font-semibold text-[#991B1B]">
                                      Use an email template
                                    </span>
                                    <select
                                      value={templateCatFilter}
                                      onChange={e => setTemplateCatFilter(e.target.value)}
                                      className="text-xs text-[#991B1B] bg-transparent focus:outline-none"
                                    >
                                      <option value="All">All</option>
                                      <option value="General">General</option>
                                    </select>
                                  </div>

                                  <div className="relative mb-3">
                                    <Search className="w-3.5 h-3.5 text-[#DC2626] absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                      type="text"
                                      value={templateSearch}
                                      onChange={e => setTemplateSearch(e.target.value)}
                                      placeholder="Search"
                                      className="w-full pl-8 pr-2.5 py-1.5 border border-[#FECACA] rounded-md text-xs text-[#0F172A] focus:outline-none focus:border-[#DC2626]"
                                    />
                                  </div>

                                  {filteredTemplates.length === 0 ? (
                                    <div className="py-8 text-center space-y-3">
                                      <div className="text-xs text-[#991B1B]">
                                        Create your first email template
                                      </div>
                                      <button
                                        onClick={() => {
                                          setShowTemplatesPopover(false);
                                          setShowCreateTemplateModal(true);
                                        }}
                                        className="px-4 py-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded-md shadow-sm"
                                      >
                                        Create Template
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                      {filteredTemplates.map((tpl: any) => (
                                        <button
                                          key={tpl.id}
                                          onClick={() => applyTemplateToDraft(tpl)}
                                          className="w-full text-left p-2 rounded hover:bg-[#FEF2F2] border border-transparent hover:border-[#FECACA]"
                                        >
                                          <div className="text-xs font-semibold text-[#991B1B]">
                                            {tpl.name}
                                          </div>
                                          <div className="text-[11px] text-[#64748B] truncate">
                                            {tpl.body}
                                          </div>
                                        </button>
                                      ))}
                                      <button
                                        onClick={() => {
                                          setShowTemplatesPopover(false);
                                          setShowCreateTemplateModal(true);
                                        }}
                                        className="w-full mt-2 py-1.5 text-center text-xs font-semibold text-[#DC2626] border-t border-[#FECACA]"
                                      >
                                        + New Template
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* # Conversation ID button */}
                            <button
                              onClick={() => {
                                const code = activeConversation.conversation_code;
                                handleDraftChange(draftBody ? `${draftBody} ${code}` : code);
                              }}
                              className="flex items-center gap-1 text-[#991B1B] hover:text-[#DC2626] font-semibold"
                            >
                              <Hash className="w-3.5 h-3.5 text-[#DC2626]" />
                              <span>Conversation ID</span>
                            </button>

                            {/* Customer Portal button */}
                            <button
                              onClick={() => setShowPortalModal(true)}
                              className="flex items-center gap-1.5 text-[#991B1B] hover:text-[#DC2626] font-semibold"
                            >
                              <Globe className="w-3.5 h-3.5 text-[#DC2626]" />
                              <span>Customer Portal</span>
                            </button>
                          </div>

                          {/* Row 2: Current Features (Split Conversation, AI Smart Reply, AI Summarize) */}
                          <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-[#FECACA]">
                            <button
                              type="button"
                              onClick={() => setIsSplitPrivate(!isSplitPrivate)}
                              className="px-2.5 py-1 rounded bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[11px] font-semibold"
                            >
                              {isSplitPrivate
                                ? 'Cancel Split Conversation'
                                : 'Reply Privately (Split Conversation)'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSmartCompose('professional')}
                              className="px-2.5 py-1 rounded bg-white hover:bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] text-[11px] font-semibold"
                            >
                              AI Smart Reply (Professional)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSmartCompose('concise')}
                              className="px-2.5 py-1 rounded bg-white hover:bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] text-[11px] font-semibold"
                            >
                              AI Smart Reply (Concise)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAiSummarizer()}
                              className="px-2.5 py-1 rounded bg-white hover:bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] text-[11px] font-semibold"
                            >
                              AI Summarize Thread to Note
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT COLLABORATION SIDEBAR (Exact match to Screenshot 000400.png) */}
        {showRightPanel && (
          <RightCollaborationPanel
            conversation={activeConversation}
            users={bootstrap.users}
            inboxes={bootstrap.inboxes}
            allTags={bootstrap.tags}
            customFields={bootstrap.customFields}
            currentUserName={currentUserName}
            onUpdateConversation={handleUpdateConversation}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            onAddNote={body => handleAddNote(body, false)}
            onRequestApproval={async (title, approverName) => {
              if (!activeConversation) return;
              const res = await fetch(
                `/api/conversations/${activeConversation.id}/approvals`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    requested_by_name: currentUserName,
                    approver_name: approverName,
                    title,
                  }),
                }
              );
              setActiveConversation(await res.json());
            }}
            onDecisionApproval={async (approvalId, status) => {
              const res = await fetch(`/api/approvals/${approvalId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, actor_name: currentUserName }),
              });
              setActiveConversation(await res.json());
            }}
            onAddExternalLink={async (provider, title) => {
              if (!activeConversation) return;
              const res = await fetch(
                `/api/conversations/${activeConversation.id}/external-links`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    provider,
                    title,
                    actor_name: currentUserName,
                  }),
                }
              );
              setActiveConversation(await res.json());
            }}
            onClosePanel={() => setShowRightPanel(false)}
          />
        )}
      </div>

      {/* MODALS */}
      {showAnalyticsModal && (
        <AnalyticsModal
          onClose={() => setShowAnalyticsModal(false)}
          inboxes={bootstrap.inboxes}
          dashboards={bootstrap.dashboards}
          customReports={bootstrap.customReports}
          currentUserName={currentUserName}
          onRefreshBootstrap={fetchBootstrap}
        />
      )}

      {showAdminModal && (
        <AdminPanelModal
          onClose={() => setShowAdminModal(false)}
          initialSection={adminInitialSection}
          inboxes={bootstrap.inboxes}
          users={bootstrap.users}
          tags={bootstrap.tags}
          customFields={bootstrap.customFields}
          slaPolicies={bootstrap.slaPolicies}
          automations={bootstrap.automations}
          connectors={bootstrap.connectors}
          webhooks={bootstrap.webhooks}
          chatbots={bootstrap.chatbots}
          settings={bootstrap.settings}
          onRefreshBootstrap={fetchBootstrap}
          onOpenReceiveModal={channel => {
            setNewConvDefaultChannel(channel);
            setShowNewConvModal(true);
          }}
        />
      )}

      {showShareModal && activeConversation && (
        <ShareConversationModal
          conversation={activeConversation}
          onClose={() => setShowShareModal(false)}
          onTogglePublicLink={enabled =>
            handleUpdateConversation({ public_link_enabled: enabled })
          }
        />
      )}

      {showAiModal && activeConversation && (
        <AiSummarizerModal
          summary={aiSummaryText}
          loading={aiLoading}
          onClose={() => setShowAiModal(false)}
          onSaveAsNote={async summaryText => {
            await handleAddNote(summaryText, true);
            setShowAiModal(false);
          }}
        />
      )}

      {showCreateTemplateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateTemplateModal(false)}
          onCreated={fetchBootstrap}
          currentUserName={currentUserName}
        />
      )}

      {showPortalModal && (
        <CustomerPortalModal
          conversation={activeConversation}
          onClose={() => setShowPortalModal(false)}
          onInsertText={text => handleDraftChange(draftBody ? `${draftBody}\n\n${text}` : text)}
          onUpdated={() => {
            if (activeConversation) openConversation(activeConversation.id);
          }}
        />
      )}

      {showNewConvModal && (
        <NewConversationModal
          inboxes={bootstrap.inboxes}
          defaultChannel={newConvDefaultChannel}
          currentUserName={currentUserName}
          onClose={() => setShowNewConvModal(false)}
          onCreated={conv => {
            fetchConversations();
            fetchBootstrap();
            openConversation(conv.id);
          }}
        />
      )}

      {showGmailSyncModal && (
        <div className="threadly-modal-backdrop fixed inset-0 bg-slate-900/45 flex items-center justify-center z-50 p-4">
          <div className="threadly-modal-surface bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Gmail Synchronization
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Direct browser bridge via the Threadly Chrome Extension (Zero Google Cloud setup)
                </p>
              </div>
              <button
                onClick={() => setShowGmailSyncModal(false)}
                className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A] px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Chrome Extension Direct Tab Sync */}
              <div className="p-5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0F172A] text-sm">
                    Direct Browser Sync (Zero Setup)
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] text-[10px] font-bold">
                    No Passwords or API Keys Needed
                  </span>
                </div>
                <p className="text-[#475569] leading-relaxed text-xs">
                  Threadly connects directly to your active Gmail tab. Simply browse your Gmail{' '}
                  <strong>Inbox</strong> or <strong>Sent</strong> mail with the Chrome Extension loaded,
                  and click <strong className="text-[#DC2626]">Sync Mail</strong> in the left sidebar.
                  All emails sync automatically into your shared inboxes.
                </p>

                <div className="pt-2 flex items-center gap-3">
                  <a
                    href="https://mail.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-xs rounded-lg transition-colors shadow-sm"
                  >
                    <span>Open Gmail in Chrome</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      fetchConversations();
                      fetchBootstrap();
                      setGmailSyncResult('Refreshed conversations from local backend.');
                    }}
                    className="px-4 py-2 border border-[#CBD5E1] hover:border-[#DC2626] text-[#0F172A] font-semibold text-xs rounded-lg transition-colors"
                  >
                    Refresh Inbox
                  </button>
                </div>
              </div>

              {gmailSyncResult && (
                <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs">
                  {gmailSyncResult}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
