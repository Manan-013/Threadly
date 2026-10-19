import React, { useState } from 'react';
import {
  Inbox,
  Contact2,
  X,
  MoreVertical,
  Clock,
  ChevronDown,
  Tag,
  History,
  ExternalLink,
  Plus,
  User,
  Zap,
  Mail,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Link2,
} from 'lucide-react';

interface RightCollaborationPanelProps {
  conversation: any;
  users: any[];
  inboxes: any[];
  allTags: any[];
  customFields: any[];
  currentUserName: string;
  onUpdateConversation: (patch: any) => void;
  onAddTag: (tagId?: number, tagName?: string) => void;
  onRemoveTag: (tagId: number) => void;
  onAddNote: (body: string) => void;
  onRequestApproval: (title: string, approverName: string) => void;
  onDecisionApproval: (approvalId: number, status: 'Approved' | 'Rejected') => void;
  onAddExternalLink: (provider: string, title: string) => void;
  onClosePanel?: () => void;
}

export const RightCollaborationPanel: React.FC<RightCollaborationPanelProps> = ({
  conversation,
  users,
  inboxes,
  allTags,
  customFields,
  currentUserName,
  onUpdateConversation,
  onAddTag,
  onRemoveTag,
  onAddNote,
  onRequestApproval,
  onDecisionApproval,
  onAddExternalLink,
  onClosePanel,
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'contact'>('inbox');
  const [activityFilter, setActivityFilter] = useState<'all' | 'notes'>('all');
  const [showActivityDropdown, setShowActivityDropdown] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [showSlaDetails, setShowSlaDetails] = useState(false);

  // Approvals state
  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [approvalTitle, setApprovalTitle] = useState('');
  const [approvalTarget, setApprovalTarget] = useState(users[0]?.name || 'Manager');

  // External link state (Jira / Salesforce / Asana / QuickBooks)
  const [extProvider, setExtProvider] = useState('jira');
  const [extTitle, setExtTitle] = useState('');

  if (!conversation) {
    return (
      <aside className="w-80 border-l border-[#E2E8F0] bg-white flex flex-col items-center justify-center p-6 text-center shrink-0">
        <Inbox className="w-8 h-8 text-[#CBD5E1] mb-2" />
        <div className="text-xs font-semibold text-[#0F172A]">No Conversation Selected</div>
        <p className="text-[11px] text-[#64748B] mt-1">
          Select a conversation from the list or create a new thread to view its Threadly collaboration panel.
        </p>
      </aside>
    );
  }

  const appliedTagIds = new Set((conversation.tags || []).map((t: any) => t.id));
  const availableTags = allTags.filter(t => !appliedTagIds.has(t.id));

  const formatSlaDue = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const isTomorrow = d.getDate() !== new Date().getDate();
    return `${timeStr} ${isTomorrow ? 'tomorrow' : 'today'}`;
  };

  const statusColorClass =
    conversation.status === 'Open'
      ? 'bg-[#DC2626] text-white'
      : conversation.status === 'Pending'
      ? 'bg-[#D97706] text-white'
      : 'bg-[#059669] text-white';

  // Combine activities and notes for timeline
  const activities = conversation.activities || [];
  const notes = conversation.notes || [];

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    onAddNote(noteInput.trim());
    setNoteInput('');
  };

  const renderActivityIcon = (type: string) => {
    if (type === 'tag_added' || type === 'tag_removed' || type === 'automation_triggered') {
      return <Tag className="w-3.5 h-3.5 text-[#9333EA] shrink-0 mt-0.5" />;
    }
    if (type === 'assigned') {
      return <User className="w-3.5 h-3.5 text-[#2563EB] shrink-0 mt-0.5" />;
    }
    if (type === 'sla_applied') {
      return <Zap className="w-3.5 h-3.5 text-[#475569] shrink-0 mt-0.5" />;
    }
    if (type === 'note_added') {
      return <MessageSquare className="w-3.5 h-3.5 text-[#DC2626] shrink-0 mt-0.5" />;
    }
    return <Mail className="w-3.5 h-3.5 text-[#DC2626] shrink-0 mt-0.5" />;
  };

  return (
    <aside className="threadly-drawer-right w-80 border-l border-[#E2E8F0] bg-white flex flex-col shrink-0 h-full select-none">
      {/* Top Sidebar Tabs matching Screenshot 000400.png */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3">
        <div className="flex items-center">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-3.5 py-2.5 border-b-2 transition-colors ${
              activeTab === 'inbox'
                ? 'border-[#DC2626] text-[#DC2626]'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
            title="Shared Inbox Collaboration"
          >
            <Inbox className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTab('contact')}
            className={`px-3.5 py-2.5 border-b-2 transition-colors ${
              activeTab === 'contact'
                ? 'border-[#DC2626] text-[#DC2626]'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
            title="Contact Details & Integrations"
          >
            <Contact2 className="w-4 h-4" />
          </button>
        </div>

        {onClosePanel && (
          <button
            onClick={onClosePanel}
            className="p-1 text-[#64748B] hover:text-[#0F172A] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {activeTab === 'inbox' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Inbox Selector Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-[#DC2626]" />
              <select
                value={conversation.inbox_id || ''}
                onChange={e =>
                  onUpdateConversation({
                    inbox_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="text-xs font-semibold text-[#0F172A] bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="">Shared Inbox</option>
                {inboxes.map(ib => (
                  <option key={ib.id} value={ib.id}>
                    {ib.name}
                  </option>
                ))}
              </select>
            </div>
            <MoreVertical className="w-3.5 h-3.5 text-[#64748B]" />
          </div>

          {/* SLA Resolution Due Banner matching Screenshot 000400.png */}
          {conversation.resolution_due_at && (
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
              <div
                onClick={() => setShowSlaDetails(!showSlaDetails)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2 text-[11px] text-[#334155]">
                  <Clock className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                  <span>
                    Resolution due by{' '}
                    <strong className="font-mono tabular-nums text-[#0F172A]">
                      {formatSlaDue(conversation.resolution_due_at)}
                    </strong>
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
              </div>
              {showSlaDetails && (
                <div className="mt-2 pt-2 border-t border-[#E2E8F0] text-[10px] text-[#64748B] space-y-1 tabular-nums">
                  <div>Policy: {conversation.sla_policy_name || 'Standard SLA'}</div>
                  {conversation.first_response_due_at && (
                    <div>
                      First response due: {formatSlaDue(conversation.first_response_due_at)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Assigned to & Status row matching Screenshot 000400.png */}
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-7">
              <label className="block text-[11px] text-[#64748B] mb-1">Assigned to</label>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] text-[10px] font-semibold flex items-center justify-center shrink-0">
                  {conversation.assignee_name
                    ? conversation.assignee_name
                        .split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()
                    : '--'}
                </div>
                <select
                  value={conversation.assignee_id || ''}
                  onChange={e =>
                    onUpdateConversation({
                      assignee_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full text-xs font-medium text-[#0F172A] bg-transparent border-b border-transparent hover:border-[#CBD5E1] py-0.5 focus:outline-none truncate cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="col-span-5">
              <label className="block text-[11px] text-[#64748B] mb-1">Status</label>
              <select
                value={conversation.status}
                onChange={e => onUpdateConversation({ status: e.target.value })}
                className={`w-full px-2.5 py-1 rounded text-xs font-medium cursor-pointer focus:outline-none ${statusColorClass}`}
              >
                <option value="Open" className="bg-white text-[#0F172A]">
                  Open
                </option>
                <option value="Pending" className="bg-white text-[#0F172A]">
                  Pending
                </option>
                <option value="Closed" className="bg-white text-[#0F172A]">
                  Closed
                </option>
              </select>
            </div>
          </div>

          {/* Tags row matching Screenshot 000400.png */}
          <div className="relative">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[11px] font-semibold text-[#334155] transition-colors"
              >
                <Tag className="w-3 h-3 text-[#DC2626]" />
                <span>TAG</span>
              </button>

              {(conversation.tags || []).map((t: any) => (
                <span
                  key={t.id}
                  onClick={() => onRemoveTag(t.id)}
                  title="Click to remove tag"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border cursor-pointer hover:opacity-80"
                  style={{
                    borderColor: t.color || '#DC2626',
                    color: t.color || '#DC2626',
                    backgroundColor: `${t.color || '#DC2626'}10`,
                  }}
                >
                  <span>{t.name}</span>
                </span>
              ))}
            </div>

            {showTagPicker && (
              <div className="threadly-popover-top-left mt-2 p-2.5 bg-white border border-[#E2E8F0] rounded-lg space-y-2 z-20">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={e => setNewTagInput(e.target.value)}
                    placeholder="Type or create tag..."
                    className="flex-1 border border-[#E2E8F0] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#DC2626]"
                  />
                  <button
                    onClick={() => {
                      if (newTagInput.trim()) {
                        onAddTag(undefined, newTagInput.trim());
                        setNewTagInput('');
                        setShowTagPicker(false);
                      }
                    }}
                    className="px-2.5 py-1 bg-[#DC2626] text-white text-xs rounded font-medium"
                  >
                    Add
                  </button>
                </div>
                {availableTags.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 pt-1 border-t border-[#F1F5F9]">
                    {availableTags.map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          onAddTag(t.id);
                          setShowTagPicker(false);
                        }}
                        className="w-full text-left px-2 py-1 text-xs hover:bg-[#F8FAFC] rounded flex items-center gap-2"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        <span>{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Priority Dropdown matching Screenshot 000400.png */}
          <div>
            <label className="block text-xs font-medium text-[#0F172A] mb-1.5">Priority</label>
            <select
              value={conversation.priority || '--'}
              onChange={e => onUpdateConversation({ priority: e.target.value })}
              className="w-full border border-[#CBD5E1] rounded-md px-3 py-1.5 text-xs text-[#0F172A] bg-white focus:outline-none focus:border-[#DC2626]"
            >
              <option value="--">--</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>

          {/* Dynamic Custom Fields */}
          {customFields.map(cf => (
            <div key={cf.id}>
              <label className="block text-xs font-medium text-[#0F172A] mb-1">{cf.name}</label>
              <select
                value={conversation.custom_fields?.[cf.name] || ''}
                onChange={e =>
                  onUpdateConversation({
                    custom_fields: { [cf.name]: e.target.value },
                  })
                }
                className="w-full border border-[#CBD5E1] rounded-md px-3 py-1.5 text-xs text-[#0F172A] bg-white focus:outline-none focus:border-[#DC2626]"
              >
                <option value="">--</option>
                {(cf.options || []).map((opt: string) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {/* Approvals Workflow */}
          <div className="pt-1 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-[#475569] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#DC2626]" />
                <span>Approvals</span>
              </span>
              <button
                onClick={() => setShowApprovalForm(!showApprovalForm)}
                className="text-[11px] font-medium text-[#DC2626] hover:underline"
              >
                + Request
              </button>
            </div>

            {showApprovalForm && (
              <div className="threadly-popover-top-left p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md space-y-2 mb-2">
                <input
                  type="text"
                  value={approvalTitle}
                  onChange={e => setApprovalTitle(e.target.value)}
                  placeholder="Approval reason (e.g. 15% Bulk Discount)"
                  className="w-full border border-[#E2E8F0] bg-white rounded px-2 py-1 text-xs"
                />
                <div className="flex gap-1.5">
                  <select
                    value={approvalTarget}
                    onChange={e => setApprovalTarget(e.target.value)}
                    className="flex-1 border border-[#E2E8F0] bg-white rounded px-2 py-1 text-xs"
                  >
                    <option value="Manager">Manager</option>
                    {users.map(u => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (approvalTitle.trim()) {
                        onRequestApproval(approvalTitle.trim(), approvalTarget);
                        setApprovalTitle('');
                        setShowApprovalForm(false);
                      }
                    }}
                    className="px-2.5 py-1 bg-[#DC2626] text-white text-xs rounded font-medium"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            {(conversation.approvals || []).map((ap: any) => (
              <div
                key={ap.id}
                className="p-2.5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-xs mb-1.5"
              >
                <div className="flex items-center justify-between font-medium text-[#0F172A]">
                  <span>{ap.title}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      ap.status === 'Approved'
                        ? 'bg-[#ECFDF5] text-[#059669]'
                        : ap.status === 'Rejected'
                        ? 'bg-[#FEF2F2] text-[#DC2626]'
                        : 'bg-[#FEF3C7] text-[#D97706]'
                    }`}
                  >
                    {ap.status}
                  </span>
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  Approver: {ap.approver_name}
                </div>
                {ap.status === 'Pending' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => onDecisionApproval(ap.id, 'Approved')}
                      className="flex items-center gap-1 px-2 py-0.5 bg-[#059669] text-white rounded text-[10px] font-medium"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Approve
                    </button>
                    <button
                      onClick={() => onDecisionApproval(ap.id, 'Rejected')}
                      className="flex items-center gap-1 px-2 py-0.5 bg-[#DC2626] text-white rounded text-[10px] font-medium"
                    >
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Activity & Internal Notes Feed matching Screenshot 000400.png */}
          <div className="pt-2 border-t border-[#E2E8F0]">
            {/* Filter Header: All activity (N) vs Only notes */}
            <div className="flex items-center justify-between mb-3 relative">
              <button
                onClick={() => setShowActivityDropdown(!showActivityDropdown)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] hover:text-[#DC2626] tabular-nums"
              >
                <History className="w-3.5 h-3.5 text-[#DC2626]" />
                <span>
                  {activityFilter === 'all'
                    ? `All activity (${activities.length})`
                    : `Only notes (${notes.length})`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
              </button>

              <ExternalLink className="w-3.5 h-3.5 text-[#64748B]" />

              {showActivityDropdown && (
                <div className="threadly-popover-top-left absolute left-0 top-7 bg-white border border-[#E2E8F0] rounded-md py-1 w-40 z-20 tabular-nums">
                  <button
                    onClick={() => {
                      setActivityFilter('all');
                      setShowActivityDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#F8FAFC] text-[#0F172A]"
                  >
                    All activity ({activities.length})
                  </button>
                  <button
                    onClick={() => {
                      setActivityFilter('notes');
                      setShowActivityDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#F8FAFC] text-[#0F172A]"
                  >
                    Only notes
                  </button>
                </div>
              )}
            </div>

            {/* + Add a note... input box matching Screenshot 000429.png */}
            <form onSubmit={handleNoteSubmit} className="mb-4">
              <div className="flex items-center bg-[#F1F5F9] rounded-md px-3 py-2 border border-transparent focus-within:border-[#DC2626] focus-within:bg-white transition-colors">
                <Plus className="w-3.5 h-3.5 text-[#64748B] mr-2 shrink-0" />
                <input
                  type="text"
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder="Add a note... (use @name to mention)"
                  className="w-full bg-transparent text-xs text-[#0F172A] placeholder-[#64748B] focus:outline-none"
                />
              </div>
            </form>

            <div className="text-center text-[10px] font-medium text-[#94A3B8] mb-3">Today</div>

            {/* Notes Cards */}
            {notes.length > 0 && (
              <div className="space-y-2.5 mb-4">
                {notes.map((n: any) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#991B1B]">{n.author_name}</span>
                      <span className="text-[10px] text-[#64748B] tabular-nums">
                        {new Date(n.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-[#0F172A] whitespace-pre-line leading-relaxed">
                      {n.body}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Activity Audit Timeline matching Screenshot 000400.png */}
            {activityFilter === 'all' && (
              <div className="space-y-3.5">
                {activities.map((act: any) => (
                  <div key={act.id} className="flex items-start gap-2.5 text-xs">
                    {renderActivityIcon(act.activity_type)}
                    <div className="flex-1 min-w-0">
                      <div className="text-[#334155] leading-snug">{act.description}</div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5 tabular-nums">
                        {new Date(act.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: CONTACT DETAILS & EXTERNAL INTEGRATIONS (Jira, Salesforce, Asana, QuickBooks) */
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="text-xs font-semibold text-[#0F172A]">
              {conversation.customer_name}
            </div>
            <div className="text-[11px] text-[#64748B] mt-0.5">{conversation.customer_email}</div>
            <div className="mt-2 pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px]">
              <span className="text-[#64748B]">AI Sentiment:</span>
              <span className="font-medium text-[#0F172A]">
                {conversation.sentiment || 'Neutral'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#DC2626]" />
              <span>Connected App Items (Jira / CRM)</span>
            </div>

            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-2">
              <select
                value={extProvider}
                onChange={e => setExtProvider(e.target.value)}
                className="w-full border border-[#E2E8F0] bg-white rounded px-2.5 py-1.5 text-xs"
              >
                <option value="jira">Jira Issue</option>
                <option value="salesforce">Salesforce Deal</option>
                <option value="asana">Asana Task</option>
                <option value="quickbooks">QuickBooks Invoice</option>
                <option value="slack">Slack Thread</option>
              </select>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={extTitle}
                  onChange={e => setExtTitle(e.target.value)}
                  placeholder="Title / Reference..."
                  className="flex-1 border border-[#E2E8F0] bg-white rounded px-2.5 py-1 text-xs"
                />
                <button
                  onClick={() => {
                    if (extTitle.trim()) {
                      onAddExternalLink(extProvider, extTitle.trim());
                      setExtTitle('');
                    }
                  }}
                  className="px-3 py-1 bg-[#DC2626] text-white text-xs rounded font-medium"
                >
                  Link
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {(conversation.external_links || []).map((link: any) => (
                <div
                  key={link.id}
                  className="p-2.5 border border-[#E2E8F0] rounded-md flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="uppercase text-[10px] font-bold text-[#DC2626] mr-1.5">
                      {link.provider}
                    </span>
                    <span className="font-medium text-[#0F172A]">{link.title}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#64748B]">{link.external_id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
