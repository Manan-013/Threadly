import React, { useEffect, useState } from 'react';
import {
  X,
  LayoutGrid,
  Inbox,
  BookOpen,
  Tag,
  Plug,
  Users,
  Code2,
  Settings,
  Mail,
  MessageSquare,
  Phone,
  Bot,
  Sliders,
  Zap,
  UserCheck,
  Clock,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { ThreadlyHexIcon } from './ThreadlyBrandIcon';

interface AdminPanelModalProps {
  onClose: () => void;
  initialSection?: string;
  inboxes: any[];
  users: any[];
  tags: any[];
  customFields: any[];
  slaPolicies: any[];
  automations: any[];
  connectors: any[];
  webhooks: any[];
  chatbots: any[];
  settings: any;
  onRefreshBootstrap: () => void;
  onOpenReceiveModal?: (channel: string) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  onClose,
  initialSection = 'home',
  inboxes,
  users,
  tags,
  customFields,
  slaPolicies,
  automations,
  connectors,
  webhooks,
  chatbots,
  settings,
  onRefreshBootstrap,
  onOpenReceiveModal,
}) => {
  const [activeNav, setActiveNav] = useState<string>(initialSection);
  const [settingsSubTab, setSettingsSubTab] = useState<
    'automations' | 'auto_assignment' | 'sla' | 'chatbots' | 'custom_fields'
  >('automations');

  // Shared Inbox creation state
  const [inboxName, setInboxName] = useState('');
  const [inboxEmail, setInboxEmail] = useState('');
  const [inboxChannel, setInboxChannel] = useState('email');
  const [inboxAutoAssign, setInboxAutoAssign] = useState('none');

  // Tag creation state
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#DC2626');
  const [tagDesc, setTagDesc] = useState('');

  // User creation state
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('Agent');
  const [userCapacity, setUserCapacity] = useState(25);
  const [userPassword, setUserPassword] = useState('');
  const [userError, setUserError] = useState<string | null>(null);

  // Automation creation state
  const [ruleName, setRuleName] = useState('');
  const [ruleField, setRuleField] = useState('subject');
  const [ruleOp, setRuleOp] = useState('contains');
  const [ruleVal, setRuleVal] = useState('');
  const [ruleAddTag, setRuleAddTag] = useState('');
  const [ruleAssignUserId, setRuleAssignUserId] = useState('');
  const [rulePriority, setRulePriority] = useState('');

  // SLA creation state
  const [slaName, setSlaName] = useState('');
  const [slaField, setSlaField] = useState('tag');
  const [slaValue, setSlaValue] = useState('');
  const [slaFrtMins, setSlaFrtMins] = useState(60);
  const [slaResMins, setSlaResMins] = useState(720);

  // Custom field creation state
  const [cfName, setCfName] = useState('');
  const [cfOptions, setCfOptions] = useState('Low, Medium, High, Urgent');

  // Chatbot creation state
  const [botName, setBotName] = useState('');
  const [botWelcome, setBotWelcome] = useState('');
  const [botFallback, setBotFallback] = useState('');

  // Knowledge Base state
  const [kbData, setKbData] = useState<{ categories: any[]; articles: any[] }>({
    categories: [],
    articles: [],
  });
  const [kbCatName, setKbCatName] = useState('');
  const [kbArtTitle, setKbArtTitle] = useState('');
  const [kbArtCatId, setKbArtCatId] = useState('');
  const [kbArtContent, setKbArtContent] = useState('');

  // Developer / Webhook / Gemini state
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [geminiKey, setGeminiKey] = useState(settings?.gemini_api_key || '');
  const [savedNotice, setSavedNotice] = useState('');

  const fetchKb = async () => {
    const res = await fetch('/api/kb');
    const data = await res.json();
    setKbData(data);
  };

  useEffect(() => {
    fetchKb();
  }, []);

  const handleCreateInbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboxName.trim() || !inboxEmail.trim()) return;
    await fetch('/api/inboxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: inboxName.trim(),
        email: inboxEmail.trim(),
        channel_type: inboxChannel,
        auto_assign_mode: inboxAutoAssign,
      }),
    });
    setInboxName('');
    setInboxEmail('');
    onRefreshBootstrap();
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tagName.trim(),
        color: tagColor,
        description: tagDesc.trim(),
      }),
    });
    setTagName('');
    setTagDesc('');
    onRefreshBootstrap();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) return;
    setUserError(null);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: userName.trim(),
        email: userEmail.trim(),
        role: userRole,
        max_capacity: userCapacity,
        // Optional: without a password the person can be assigned conversations but cannot sign in.
        ...(userPassword ? { password: userPassword } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setUserError(data.error || 'Could not save this user.');
      return;
    }
    setUserName('');
    setUserEmail('');
    setUserPassword('');
    onRefreshBootstrap();
  };

  const handleCreateAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !ruleVal.trim()) return;
    await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ruleName.trim(),
        condition_field: ruleField,
        condition_operator: ruleOp,
        condition_value: ruleVal.trim(),
        action_add_tag: ruleAddTag.trim(),
        action_assign_user_id: ruleAssignUserId ? Number(ruleAssignUserId) : null,
        action_set_priority: rulePriority,
      }),
    });
    setRuleName('');
    setRuleVal('');
    setRuleAddTag('');
    setRuleAssignUserId('');
    setRulePriority('');
    onRefreshBootstrap();
  };

  const handleCreateSla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slaName.trim()) return;
    await fetch('/api/sla-policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: slaName.trim(),
        condition_field: slaField,
        condition_value: slaValue.trim(),
        first_response_minutes: Number(slaFrtMins) || 60,
        resolution_minutes: Number(slaResMins) || 720,
      }),
    });
    setSlaName('');
    setSlaValue('');
    onRefreshBootstrap();
  };

  const handleCreateCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfName.trim()) return;
    const opts = cfOptions
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    await fetch('/api/custom-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cfName.trim(), field_type: 'dropdown', options: opts }),
    });
    setCfName('');
    onRefreshBootstrap();
  };

  const handleCreateChatbot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botName.trim() || !botWelcome.trim()) return;
    await fetch('/api/chatbots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: botName.trim(),
        welcome_message: botWelcome.trim(),
        fallback_message: botFallback.trim() || 'Connecting you with an agent...',
      }),
    });
    setBotName('');
    setBotWelcome('');
    setBotFallback('');
    onRefreshBootstrap();
  };

  const handleToggleConnector = async (provider: string, currentlyConnected: boolean) => {
    await fetch('/api/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        is_connected: !currentlyConnected,
        config: { connected_at: new Date().toISOString() },
      }),
    });
    onRefreshBootstrap();
  };

  const handleCreateKbCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbCatName.trim()) return;
    await fetch('/api/kb/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: kbCatName.trim() }),
    });
    setKbCatName('');
    fetchKb();
  };

  const handleCreateKbArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbArtTitle.trim() || !kbArtContent.trim()) return;
    await fetch('/api/kb/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: kbArtCatId ? Number(kbArtCatId) : null,
        title: kbArtTitle.trim(),
        content: kbArtContent.trim(),
      }),
    });
    setKbArtTitle('');
    setKbArtContent('');
    fetchKb();
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whName.trim() || !whUrl.trim()) return;
    await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: whName.trim(), target_url: whUrl.trim() }),
    });
    setWhName('');
    setWhUrl('');
    onRefreshBootstrap();
  };

  const handleSaveGeminiKey = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { gemini_api_key: geminiKey.trim() } }),
    });
    setSavedNotice('API Settings saved.');
    onRefreshBootstrap();
    setTimeout(() => setSavedNotice(''), 3000);
  };

  const isConnected = (provider: string) =>
    connectors.some(c => c.provider === provider && c.is_connected === 1);

  return (
    <div className="fixed inset-0 z-50 bg-white flex overflow-hidden">
      {/* LEFT SIDEBAR: Exact match to Screenshot 000547.png */}
      <aside className="w-60 border-r border-[#E2E8F0] bg-[#F8FAFC] flex flex-col shrink-0">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ThreadlyHexIcon size={28} />
            <div>
              <div className="font-brand text-xs text-[#0F172A] tracking-tight">
                THREAD<span className="text-[#DC2626]">LY</span>
              </div>
              <div className="text-xs font-semibold text-[#64748B]">Admin Panel</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-[#E2E8F0]/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-1">
          {[
            { id: 'home', label: 'Home', icon: LayoutGrid },
            { id: 'inboxes', label: 'Shared Inboxes', icon: Inbox },
            { id: 'kb', label: 'Knowledge Base', icon: BookOpen, badge: 'Upgraded' },
            { id: 'tags', label: 'Shared Labels', icon: Tag },
            { id: 'connectors', label: 'Connectors', icon: Plug },
            { id: 'users', label: 'Users & Roles', icon: Users },
            { id: 'developer', label: 'Developer', icon: Code2 },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map(item => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-r-full text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#FEF2F2] text-[#991B1B] font-semibold'
                    : 'text-[#334155] hover:bg-[#F1F5F9]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-[#DC2626]' : 'text-[#64748B]'}`} />
                  <span>{item.label}</span>
                </span>
                {item.badge && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-white px-10 py-8">
        {activeNav === 'home' && (
          /* EXPLORE THREADLY HUB (Exact match to Screenshot 000547.png) */
          <div className="max-w-5xl space-y-8">
            {/* Top Community Banner */}
            <div className="border border-[#E2E8F0] rounded-lg px-5 py-3.5 flex items-center justify-between bg-white shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] font-bold text-xs">
                  #
                </div>
                <span className="text-xs text-[#334155]">
                  <strong className="text-[#0F172A]">Threadly Community &amp; Chrome Extension:</strong>{' '}
                  Connect both your real Gmail tab and this Dashboard to the same live SQLite workspace.
                </span>
              </div>
              <button
                onClick={() => setActiveNav('developer')}
                className="px-3.5 py-1.5 border border-[#CBD5E1] hover:border-[#DC2626] text-xs font-medium text-[#0F172A] rounded-md transition-colors"
              >
                Extension Setup
              </button>
            </div>

            <h1 className="text-lg font-semibold text-[#0F172A]">
              Explore <span className="font-brand text-[#DC2626] ml-1">Threadly</span>
            </h1>

            {/* Section 1: Engage with your customers */}
            <div>
              <h2 className="text-xs font-semibold text-[#0F172A] mb-3.5">
                Engage with your customers
              </h2>
              <div className="grid grid-cols-5 gap-4">
                <div
                  onClick={() => {
                    setInboxChannel('email');
                    setActiveNav('inboxes');
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] mb-3">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">Email</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed mb-2">
                    Route emails from support@, sales@, etc
                  </p>
                  <span className="text-[11px] text-[#DC2626] font-medium inline-flex items-center gap-1">
                    Configure <ExternalLink className="w-3 h-3" />
                  </span>
                </div>

                <div
                  onClick={() => {
                    if (onOpenReceiveModal) {
                      onClose();
                      onOpenReceiveModal('chat');
                    } else {
                      setInboxChannel('chat');
                      setActiveNav('inboxes');
                    }
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] mb-3">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">Chat</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Chat with website visitors in real time
                  </p>
                </div>

                <div
                  onClick={() => {
                    if (onOpenReceiveModal) {
                      onClose();
                      onOpenReceiveModal('whatsapp');
                    } else {
                      setInboxChannel('whatsapp');
                      setActiveNav('inboxes');
                    }
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="w-8 h-8 rounded-md bg-[#ECFDF5] flex items-center justify-center text-[#059669] mb-3">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">WhatsApp</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Answer WhatsApp queries within Threadly
                  </p>
                </div>

                <div
                  onClick={() => {
                    if (onOpenReceiveModal) {
                      onClose();
                      onOpenReceiveModal('voice');
                    } else {
                      setInboxChannel('voice');
                      setActiveNav('inboxes');
                    }
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] mb-3">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">Voice</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Integrate your voice app and collaborate
                  </p>
                </div>

                <div
                  onClick={() => setActiveNav('kb')}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626]">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[#FEF2F2] text-[#DC2626]">
                      Upgraded
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">Knowledge Base</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Create a self-service website for FAQs
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: Improve team efficiency */}
            <div>
              <h2 className="text-xs font-semibold text-[#0F172A] mb-3.5">
                Improve team efficiency
              </h2>
              <div className="grid grid-cols-5 gap-4">
                <div
                  onClick={() => {
                    setSettingsSubTab('automations');
                    setActiveNav('settings');
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] mb-3">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">Automations</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Avoid repetitive manual tasks with smart logic
                  </p>
                </div>

                <div
                  onClick={() => {
                    setSettingsSubTab('auto_assignment');
                    setActiveNav('settings');
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] mb-3">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">Auto Assignment</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Don&apos;t let any conversation go unassigned
                  </p>
                </div>

                <div
                  onClick={() => {
                    setSettingsSubTab('sla');
                    setActiveNav('settings');
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] mb-3">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">SLA</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Keep customers happy by responding on time
                  </p>
                </div>

                <div
                  onClick={() => {
                    setSettingsSubTab('chatbots');
                    setActiveNav('settings');
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] mb-3">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">Chatbots</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    24/7 automated support with easy agent handoff
                  </p>
                </div>

                <div
                  onClick={() => {
                    setSettingsSubTab('custom_fields');
                    setActiveNav('settings');
                  }}
                  className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-md bg-[#FEF2F2] flex items-center justify-center text-[#DC2626]">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[#FEF2F2] text-[#DC2626]">
                      New
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] mb-1">Custom fields</div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Gather more info for better categorization
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: Explore inbox integrations */}
            <div>
              <h2 className="text-xs font-semibold text-[#0F172A] mb-3.5">
                Explore inbox integrations
              </h2>
              <div className="grid grid-cols-5 gap-4">
                {[
                  {
                    id: 'slack',
                    name: 'Slack',
                    desc: 'Receive notifications on Slack for Threadly updates',
                    color: '#E11D48',
                  },
                  {
                    id: 'jira',
                    name: 'Jira',
                    desc: 'Manage your Jira issues right inside Threadly',
                    color: '#2563EB',
                  },
                  {
                    id: 'asana',
                    name: 'Asana',
                    desc: 'Bring your Asana tasks inside Threadly',
                    color: '#F43F5E',
                  },
                  {
                    id: 'salesforce',
                    name: 'Salesforce',
                    desc: 'Assign based on Salesforce contacts',
                    color: '#0284C7',
                  },
                  {
                    id: 'quickbooks',
                    name: 'QuickBooks',
                    desc: 'Add bills to QuickBooks from within Threadly',
                    color: '#16A34A',
                  },
                ].map(integ => (
                  <div
                    key={integ.id}
                    onClick={() => setActiveNav('connectors')}
                    className="border border-[#E2E8F0] hover:border-[#DC2626] rounded-lg p-4 cursor-pointer transition-all hover:shadow-md bg-white"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs text-white"
                        style={{ backgroundColor: integ.color }}
                      >
                        {integ.name.slice(0, 2).toUpperCase()}
                      </div>
                      {isConnected(integ.id) && (
                        <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                      )}
                    </div>
                    <div className="text-xs font-semibold text-[#0F172A] mb-1">{integ.name}</div>
                    <p className="text-[11px] text-[#64748B] leading-relaxed">{integ.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SHARED INBOXES SECTION */}
        {activeNav === 'inboxes' && (
          <div className="max-w-4xl space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-[#0F172A]">Shared Inboxes</h1>
              <p className="text-xs text-[#64748B]">
                Create and manage collaborative Email, Live Chat, WhatsApp, and Voice inboxes.
              </p>
            </div>

            <form
              onSubmit={handleCreateInbox}
              className="grid grid-cols-12 gap-3 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg items-end"
            >
              <div className="col-span-3">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Inbox Name
                </label>
                <input
                  type="text"
                  value={inboxName}
                  onChange={e => setInboxName(e.target.value)}
                  placeholder="e.g. Demo Inbox"
                  className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Address / Identifier
                </label>
                <input
                  type="text"
                  value={inboxEmail}
                  onChange={e => setInboxEmail(e.target.value)}
                  placeholder="support@company.com"
                  className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">Channel</label>
                <select
                  value={inboxChannel}
                  onChange={e => setInboxChannel(e.target.value)}
                  className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-2 text-xs"
                >
                  <option value="email">Email</option>
                  <option value="chat">Live Chat</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="voice">Voice</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Auto Assignment
                </label>
                <select
                  value={inboxAutoAssign}
                  onChange={e => setInboxAutoAssign(e.target.value)}
                  className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-2 text-xs"
                >
                  <option value="none">Manual</option>
                  <option value="round_robin">Round Robin</option>
                  <option value="workload">Workload Cap</option>
                </select>
              </div>
              <div className="col-span-2">
                <button
                  type="submit"
                  className="w-full py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create</span>
                </button>
              </div>
            </form>

            <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
              {inboxes.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#94A3B8]">
                  No shared inboxes created yet. Use the form above to create your first shared inbox.
                </div>
              ) : (
                inboxes.map(ib => (
                  <div key={ib.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#0F172A]">{ib.name}</span>
                        <span className="px-2 py-0.5 text-[10px] font-medium uppercase rounded bg-[#FEF2F2] text-[#DC2626]">
                          {ib.channel_type}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#F1F5F9] text-[#475569]">
                          Routing: {ib.auto_assign_mode.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-[#64748B] mt-0.5">{ib.email}</div>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch(`/api/inboxes/${ib.id}`, { method: 'DELETE' });
                        onRefreshBootstrap();
                      }}
                      className="p-1.5 text-[#64748B] hover:text-[#DC2626]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* KNOWLEDGE BASE SECTION */}
        {activeNav === 'kb' && (
          <div className="max-w-4xl space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-[#0F172A]">Knowledge Base</h1>
              <p className="text-xs text-[#64748B]">
                Create categories and help center articles that agents can insert directly into replies.
              </p>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-4 space-y-4">
                <form
                  onSubmit={handleCreateKbCategory}
                  className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-3"
                >
                  <div className="text-xs font-semibold text-[#0F172A]">New Category</div>
                  <input
                    type="text"
                    value={kbCatName}
                    onChange={e => setKbCatName(e.target.value)}
                    placeholder="e.g. Orders & Shipping"
                    className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                  >
                    Add Category
                  </button>
                </form>

                <div className="border border-[#E2E8F0] rounded-lg p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-[#0F172A] mb-2">Categories</div>
                  {kbData.categories.length === 0 ? (
                    <div className="text-xs text-[#94A3B8]">No categories yet</div>
                  ) : (
                    kbData.categories.map(c => (
                      <div
                        key={c.id}
                        className="px-2.5 py-1.5 rounded bg-[#F8FAFC] text-xs font-medium text-[#334155]"
                      >
                        {c.name}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="col-span-8 space-y-4">
                <form
                  onSubmit={handleCreateKbArticle}
                  className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-3"
                >
                  <div className="text-xs font-semibold text-[#0F172A]">Publish Help Article</div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={kbArtTitle}
                      onChange={e => setKbArtTitle(e.target.value)}
                      placeholder="Article Title"
                      className="border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                    />
                    <select
                      value={kbArtCatId}
                      onChange={e => setKbArtCatId(e.target.value)}
                      className="border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                    >
                      <option value="">Uncategorized</option>
                      {kbData.categories.map(c => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    rows={3}
                    value={kbArtContent}
                    onChange={e => setKbArtContent(e.target.value)}
                    placeholder="Write article content..."
                    className="w-full border border-[#E2E8F0] bg-white rounded p-3 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                  >
                    Publish Article
                  </button>
                </form>

                <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                  {kbData.articles.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#94A3B8]">
                      No Knowledge Base articles published yet.
                    </div>
                  ) : (
                    kbData.articles.map(art => (
                      <div key={art.id} className="p-4 flex items-start justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#0F172A]">{art.title}</div>
                          <div className="text-[11px] text-[#64748B] mt-1">{art.content}</div>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch(`/api/kb/articles/${art.id}`, { method: 'DELETE' });
                            fetchKb();
                          }}
                          className="text-[#94A3B8] hover:text-[#DC2626]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SHARED LABELS (TAGS) SECTION */}
        {activeNav === 'tags' && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-[#0F172A]">Shared Labels &amp; Tags</h1>
              <p className="text-xs text-[#64748B]">
                Create color-coded tags (like Bulk Order, Damaged, Address Change) to organize conversations.
              </p>
            </div>

            <form
              onSubmit={handleCreateTag}
              className="flex items-end gap-3 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg"
            >
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">Tag Name</label>
                <input
                  type="text"
                  value={tagName}
                  onChange={e => setTagName(e.target.value)}
                  placeholder="e.g. Bulk Order or Damaged"
                  className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">Color</label>
                <input
                  type="color"
                  value={tagColor}
                  onChange={e => setTagColor(e.target.value)}
                  className="h-9 w-14 border border-[#E2E8F0] bg-white rounded p-1 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={tagDesc}
                  onChange={e => setTagDesc(e.target.value)}
                  placeholder="Optional description"
                  className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
              >
                Create Tag
              </button>
            </form>

            <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
              {tags.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#94A3B8]">
                  No shared tags created yet.
                </div>
              ) : (
                tags.map(t => (
                  <div key={t.id} className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="px-3 py-0.5 rounded-full text-xs font-medium border"
                        style={{
                          borderColor: t.color,
                          color: t.color,
                          backgroundColor: `${t.color}12`,
                        }}
                      >
                        {t.name}
                      </span>
                      <span className="text-xs text-[#64748B]">{t.description}</span>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch(`/api/tags/${t.id}`, { method: 'DELETE' });
                        onRefreshBootstrap();
                      }}
                      className="text-[#94A3B8] hover:text-[#DC2626]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* CONNECTORS SECTION */}
        {activeNav === 'connectors' && (
          <div className="max-w-4xl space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-[#0F172A]">Inbox Connectors</h1>
              <p className="text-xs text-[#64748B]">
                Enable third-party sidebar integrations for Slack, Jira, Asana, Salesforce, and QuickBooks.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  id: 'slack',
                  name: 'Slack',
                  desc: 'Receive notifications on Slack for Threadly updates',
                },
                {
                  id: 'jira',
                  name: 'Jira',
                  desc: 'Create and link Jira engineering issues inside Threadly conversations',
                },
                {
                  id: 'asana',
                  name: 'Asana',
                  desc: 'Link Asana project tasks directly to customer threads',
                },
                {
                  id: 'salesforce',
                  name: 'Salesforce',
                  desc: 'View CRM contact records and opportunities in the right sidebar',
                },
                {
                  id: 'quickbooks',
                  name: 'QuickBooks',
                  desc: 'Attach invoices and billing entries to customer conversations',
                },
              ].map(c => {
                const connected = isConnected(c.id);
                return (
                  <div
                    key={c.id}
                    className="border border-[#E2E8F0] rounded-lg p-5 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#0F172A]">{c.name}</div>
                      <div className="text-xs text-[#64748B] mt-1">{c.desc}</div>
                    </div>
                    <button
                      onClick={() => handleToggleConnector(c.id, connected)}
                      className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors ${
                        connected
                          ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
                          : 'bg-[#DC2626] text-white hover:bg-[#B91C1C]'
                      }`}
                    >
                      {connected ? 'Connected' : 'Connect'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* USERS & ROLES SECTION */}
        {activeNav === 'users' && (
          <div className="max-w-4xl space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-[#0F172A]">Users &amp; Roles</h1>
              <p className="text-xs text-[#64748B]">
                Add teammates so conversations can be assigned to them manually or via Automations.
              </p>
            </div>

            <form
              onSubmit={handleCreateUser}
              className="grid grid-cols-12 gap-3 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg items-end"
            >
              <div className="col-span-3">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="e.g. Francesco D'Alessio"
                  className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">Email</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                  placeholder="francesco@company.com"
                  className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Temporary password
                </label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  placeholder="min. 10 characters"
                  autoComplete="new-password"
                  className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">Role</label>
                <select
                  value={userRole}
                  onChange={e => setUserRole(e.target.value)}
                  className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-2 text-xs"
                >
                  <option value="Admin">Admin</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Agent">Agent</option>
                  <option value="Collaborator">Collaborator</option>
                </select>
              </div>
              <div className="col-span-2">
                <button
                  type="submit"
                  className="w-full py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                >
                  Add User
                </button>
              </div>
              {userError && (
                <div className="col-span-12 text-[11px] text-[#991B1B]">{userError}</div>
              )}
            </form>

            <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
              {users.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#94A3B8]">
                  No users added yet. Add your first team member above.
                </div>
              ) : (
                users.map(u => (
                  <div key={u.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#FEF2F2] text-[#DC2626] font-semibold text-xs flex items-center justify-center border border-[#FECACA]">
                        {u.name
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#0F172A]">{u.name}</div>
                        <div className="text-[11px] text-[#64748B]">
                          {u.email} &middot; {u.role} &middot; Capacity: {u.max_capacity}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
                        onRefreshBootstrap();
                      }}
                      className="text-[#94A3B8] hover:text-[#DC2626]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* DEVELOPER & CHROME EXTENSION SECTION */}
        {activeNav === 'developer' && (
          <div className="max-w-4xl space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-[#0F172A]">
                Developer, API &amp; Gmail Chrome Extension
              </h1>
              <p className="text-xs text-[#64748B]">
                Configure Webhooks, AI Summarizer keys, and load the Threadly Chrome Extension into Gmail.
              </p>
            </div>

            {/* Chrome Extension Instructions */}
            <div className="border border-[#FECACA] bg-[#FEF2F2]/60 rounded-lg p-5 space-y-2">
              <div className="text-xs font-semibold text-[#991B1B]">
                Gmail Chrome Extension (Manifest V3) — Ready to Load
              </div>
              <ol className="list-decimal list-inside text-xs text-[#334155] space-y-1">
                <li>
                  Open Google Chrome and navigate to{' '}
                  <code className="font-mono bg-white px-1.5 py-0.5 rounded border">
                    chrome://extensions
                  </code>
                </li>
                <li>Enable &ldquo;Developer mode&rdquo; in the top-right corner.</li>
                <li>
                  Click &ldquo;Load unpacked&rdquo; and select the{' '}
                  <code className="font-mono bg-white px-1.5 py-0.5 rounded border">
                    c:\Users\rkheu\Downloads\Hiver(Demo)\extension
                  </code>{' '}
                  folder.
                </li>
                <li>
                  Open <code className="font-mono">mail.google.com</code> — the Threadly right-hand
                  collaboration sidebar, top Active status bar, AI Summarizer, Share Permalink modal,
                  and Send &amp; Close compose toolbar will inject directly into Gmail and sync live
                  with this server (<code className="font-mono">http://localhost:4000</code>).
                </li>
              </ol>
            </div>

            {/* AI Key config */}
            <div className="border border-[#E2E8F0] rounded-lg p-5 space-y-3">
              <div className="text-xs font-semibold text-[#0F172A]">
                AI Summarizer &amp; Smart Compose Configuration
              </div>
              <p className="text-[11px] text-[#64748B]">
                Threadly includes a built-in deterministic NLP summarizer out of the box. Optionally
                provide a Gemini API key to use Gemini 2.0 Flash for summarization.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="Optional Gemini API Key (AIza...)"
                  className="flex-1 border border-[#E2E8F0] rounded px-3 py-2 text-xs font-mono"
                />
                <button
                  onClick={handleSaveGeminiKey}
                  className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                >
                  Save Key
                </button>
              </div>
              {savedNotice && <div className="text-xs text-[#059669]">{savedNotice}</div>}
            </div>

            {/* Webhooks */}
            <div className="border border-[#E2E8F0] rounded-lg p-5 space-y-4">
              <div className="text-xs font-semibold text-[#0F172A]">Outgoing Webhooks</div>
              <form onSubmit={handleCreateWebhook} className="flex gap-3">
                <input
                  type="text"
                  value={whName}
                  onChange={e => setWhName(e.target.value)}
                  placeholder="Webhook Name"
                  className="border border-[#E2E8F0] rounded px-3 py-2 text-xs w-56"
                />
                <input
                  type="url"
                  value={whUrl}
                  onChange={e => setWhUrl(e.target.value)}
                  placeholder="https://api.example.com/webhooks/threadly"
                  className="flex-1 border border-[#E2E8F0] rounded px-3 py-2 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                >
                  Add Webhook
                </button>
              </form>

              {webhooks.length > 0 && (
                <div className="divide-y divide-[#E2E8F0] border-t border-[#E2E8F0] pt-2">
                  {webhooks.map(w => (
                    <div key={w.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-[#0F172A]">{w.name}</span> &rarr;{' '}
                        <span className="font-mono text-[#64748B]">{w.target_url}</span>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch(`/api/webhooks/${w.id}`, { method: 'DELETE' });
                          onRefreshBootstrap();
                        }}
                        className="text-[#94A3B8] hover:text-[#DC2626]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS SECTION: Automations, Auto Assignment, SLA, Chatbots, Custom fields */}
        {activeNav === 'settings' && (
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center gap-6 border-b border-[#E2E8F0]">
              {[
                { id: 'automations', label: 'Automations' },
                { id: 'auto_assignment', label: 'Auto Assignment' },
                { id: 'sla', label: 'SLA Policies' },
                { id: 'chatbots', label: 'Chatbots' },
                { id: 'custom_fields', label: 'Custom Fields' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsSubTab(tab.id as any)}
                  className={`pb-3 text-xs font-medium border-b-2 transition-colors ${
                    settingsSubTab === tab.id
                      ? 'border-[#DC2626] text-[#DC2626] font-semibold'
                      : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {settingsSubTab === 'automations' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-[#0F172A]">
                    Rule-Based Automations (If-This-Then-That)
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Automatically apply tags, assign teammates, and set priority when new conversations arrive.
                  </p>
                </div>

                <form
                  onSubmit={handleCreateAutomation}
                  className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-3"
                >
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-4">
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        Rule Name
                      </label>
                      <input
                        type="text"
                        value={ruleName}
                        onChange={e => setRuleName(e.target.value)}
                        placeholder="e.g. Subject contains bulk"
                        className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        IF Field
                      </label>
                      <select
                        value={ruleField}
                        onChange={e => setRuleField(e.target.value)}
                        className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-2 text-xs"
                      >
                        <option value="subject">Subject</option>
                        <option value="body">Message Body</option>
                        <option value="sender_email">Sender Email</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        Operator
                      </label>
                      <select
                        value={ruleOp}
                        onChange={e => setRuleOp(e.target.value)}
                        className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-2 text-xs"
                      >
                        <option value="contains">Contains</option>
                        <option value="equals">Equals</option>
                        <option value="starts_with">Starts with</option>
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        Keyword / Value
                      </label>
                      <input
                        type="text"
                        value={ruleVal}
                        onChange={e => setRuleVal(e.target.value)}
                        placeholder="e.g. bulk"
                        className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-4">
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        THEN Apply Tag
                      </label>
                      <input
                        type="text"
                        value={ruleAddTag}
                        onChange={e => setRuleAddTag(e.target.value)}
                        placeholder="e.g. Bulk Order"
                        className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        AND Assign To
                      </label>
                      <select
                        value={ruleAssignUserId}
                        onChange={e => setRuleAssignUserId(e.target.value)}
                        className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-2 text-xs"
                      >
                        <option value="">No assignment change</option>
                        {users.map(u => (
                          <option key={u.id} value={String(u.id)}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        Set Priority
                      </label>
                      <select
                        value={rulePriority}
                        onChange={e => setRulePriority(e.target.value)}
                        className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-2 text-xs"
                      >
                        <option value="">--</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <button
                        type="submit"
                        className="w-full py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                      >
                        Save Rule
                      </button>
                    </div>
                  </div>
                </form>

                <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                  {automations.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#94A3B8]">
                      No automation rules created yet.
                    </div>
                  ) : (
                    automations.map(a => (
                      <div key={a.id} className="p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#0F172A]">{a.name}</div>
                          <div className="text-[11px] text-[#64748B] mt-0.5">
                            IF <strong>{a.condition_field}</strong> {a.condition_operator} &ldquo;
                            {a.condition_value}&rdquo;
                            {a.action_add_tag && ` -> Apply tag [${a.action_add_tag}]`}
                            {a.action_assign_user_id && ` -> Assign user #${a.action_assign_user_id}`}
                            {` (Triggered ${a.triggered_count} times)`}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch(`/api/automations/${a.id}`, { method: 'DELETE' });
                            onRefreshBootstrap();
                          }}
                          className="text-[#94A3B8] hover:text-[#DC2626]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {settingsSubTab === 'auto_assignment' && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  Round-Robin &amp; Workload Auto Assignment
                </h2>
                <p className="text-xs text-[#64748B]">
                  Configure how each Shared Inbox routes incoming unassigned conversations across active team members.
                </p>
                <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                  {inboxes.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#94A3B8]">
                      Create a Shared Inbox first to configure auto-assignment.
                    </div>
                  ) : (
                    inboxes.map(ib => (
                      <div key={ib.id} className="p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#0F172A]">{ib.name}</div>
                          <div className="text-[11px] text-[#64748B]">{ib.email}</div>
                        </div>
                        <select
                          value={ib.auto_assign_mode}
                          onChange={async e => {
                            await fetch(`/api/inboxes/${ib.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ auto_assign_mode: e.target.value }),
                            });
                            onRefreshBootstrap();
                          }}
                          className="border border-[#E2E8F0] rounded px-3 py-1.5 text-xs"
                        >
                          <option value="none">Disabled (Manual)</option>
                          <option value="round_robin">Round-Robin Auto Assignment</option>
                          <option value="workload">Workload Capacity Routing</option>
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {settingsSubTab === 'sla' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-[#0F172A]">SLA Policies</h2>
                  <p className="text-xs text-[#64748B]">
                    Set First Response and Resolution due-time targets (e.g., &ldquo;Resolution due by 2:29 AM tomorrow&rdquo;).
                  </p>
                </div>

                <form
                  onSubmit={handleCreateSla}
                  className="grid grid-cols-12 gap-3 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg items-end"
                >
                  <div className="col-span-3">
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">
                      SLA Policy Name
                    </label>
                    <input
                      type="text"
                      value={slaName}
                      onChange={e => setSlaName(e.target.value)}
                      placeholder="e.g. Address Change"
                      className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">
                      Match By
                    </label>
                    <select
                      value={slaField}
                      onChange={e => setSlaField(e.target.value)}
                      className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-2 text-xs"
                    >
                      <option value="all">All Conversations</option>
                      <option value="tag">Tag Name</option>
                      <option value="priority">Priority</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">
                      Condition Value
                    </label>
                    <input
                      type="text"
                      value={slaValue}
                      onChange={e => setSlaValue(e.target.value)}
                      placeholder="e.g. Address Change"
                      className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">
                      Resolution (Mins)
                    </label>
                    <input
                      type="number"
                      value={slaResMins}
                      onChange={e => setSlaResMins(Number(e.target.value))}
                      className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <button
                      type="submit"
                      className="w-full py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                    >
                      Add SLA
                    </button>
                  </div>
                </form>

                <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                  {slaPolicies.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#94A3B8]">
                      No SLA policies configured yet.
                    </div>
                  ) : (
                    slaPolicies.map(p => (
                      <div key={p.id} className="p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#0F172A]">{p.name} SLA</div>
                          <div className="text-[11px] text-[#64748B]">
                            Condition: {p.condition_field}{' '}
                            {p.condition_value ? `= "${p.condition_value}"` : '(All)'} &middot;
                            Resolution target: {p.resolution_minutes} mins
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch(`/api/sla-policies/${p.id}`, { method: 'DELETE' });
                            onRefreshBootstrap();
                          }}
                          className="text-[#94A3B8] hover:text-[#DC2626]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {settingsSubTab === 'chatbots' && (
              <div className="space-y-5">
                <h2 className="text-sm font-semibold text-[#0F172A]">Automated Support Chatbots</h2>
                <form
                  onSubmit={handleCreateChatbot}
                  className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={botName}
                      onChange={e => setBotName(e.target.value)}
                      placeholder="Chatbot Name (e.g. Order Triage Bot)"
                      className="border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      value={botWelcome}
                      onChange={e => setBotWelcome(e.target.value)}
                      placeholder="Welcome Greeting Message"
                      className="border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                  >
                    Create Chatbot
                  </button>
                </form>

                <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                  {chatbots.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#94A3B8]">
                      No chatbots configured yet.
                    </div>
                  ) : (
                    chatbots.map(cb => (
                      <div key={cb.id} className="p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#0F172A]">{cb.name}</div>
                          <div className="text-[11px] text-[#64748B]">{cb.welcome_message}</div>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch(`/api/chatbots/${cb.id}`, { method: 'DELETE' });
                            onRefreshBootstrap();
                          }}
                          className="text-[#94A3B8] hover:text-[#DC2626]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {settingsSubTab === 'custom_fields' && (
              <div className="space-y-5">
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  Custom Fields (Right Sidebar Dropdowns)
                </h2>
                <form
                  onSubmit={handleCreateCustomField}
                  className="flex gap-3 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg items-end"
                >
                  <div className="w-56">
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">
                      Field Label
                    </label>
                    <input
                      type="text"
                      value={cfName}
                      onChange={e => setCfName(e.target.value)}
                      placeholder="e.g. Order Type or Region"
                      className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">
                      Dropdown Options (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={cfOptions}
                      onChange={e => setCfOptions(e.target.value)}
                      className="w-full border border-[#E2E8F0] bg-white rounded px-3 py-2 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded"
                  >
                    Add Field
                  </button>
                </form>

                <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                  {customFields.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#94A3B8]">
                      Built-in field: Priority (-- / Low / Medium / High / Urgent). Add additional custom fields above.
                    </div>
                  ) : (
                    customFields.map(cf => (
                      <div key={cf.id} className="p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#0F172A]">{cf.name}</div>
                          <div className="text-[11px] text-[#64748B]">
                            Options: {(cf.options || []).join(', ')}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch(`/api/custom-fields/${cf.id}`, { method: 'DELETE' });
                            onRefreshBootstrap();
                          }}
                          className="text-[#94A3B8] hover:text-[#DC2626]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
