import React, { useState } from 'react';
import {
  X,
  Share2,
  Hash,
  Building2,
  Globe,
  Wand2,
  ThumbsUp,
  ThumbsDown,
  Info,
  Check,
  BookOpen,
} from 'lucide-react';

export const ShareConversationModal: React.FC<{
  conversation: any;
  onClose: () => void;
  onTogglePublicLink: (enabled: boolean) => void;
}> = ({ conversation, onClose, onTogglePublicLink }) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPrivate, setCopiedPrivate] = useState(false);
  const [copiedPublic, setCopiedPublic] = useState(false);

  const domain =
    (conversation?.customer_email?.split('@')[1] || 'workspace.com').toLowerCase();
  const privateUrl = `${window.location.origin}/?thread=${conversation.conversation_code}`;
  const publicUrl = `${window.location.origin}/?shared=${conversation.public_token}`;

  const copyText = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="threadly-modal-backdrop fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <div className="threadly-modal-surface bg-white rounded-xl w-full max-w-lg p-6 border border-[#E2E8F0]">
        {/* Header matching Screenshot 000429.png */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center border border-[#FECACA]">
              <Share2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#0F172A]">Share this conversation</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#64748B] hover:text-[#0F172A] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Row 1: Conversation ID */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center">
                <Hash className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#0F172A]">Conversation ID</div>
                <div className="text-xs font-mono tabular-nums text-[#64748B] mt-0.5">
                  {conversation.conversation_code}
                </div>
              </div>
            </div>
            <button
              onClick={() => copyText(conversation.conversation_code, setCopiedId)}
              className="px-4 py-1.5 rounded-md bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] text-xs font-medium transition-colors min-w-[92px]"
            >
              {copiedId ? 'Copied' : 'Copy ID'}
            </button>
          </div>

          {/* Row 2: Private link */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center shrink-0 mt-0.5">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]">
                  <span>Private link for members of {domain}</span>
                  <Info className="w-3.5 h-3.5 text-[#94A3B8]" />
                </div>
                <p className="text-[11px] italic text-[#64748B] mt-0.5 leading-relaxed">
                  Invite external collaborators by mentioning their {domain} email address in
                  Threadly notes
                </p>
              </div>
            </div>
            <button
              onClick={() => copyText(privateUrl, setCopiedPrivate)}
              className="px-4 py-1.5 rounded-md bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] text-xs font-medium transition-colors shrink-0 min-w-[92px]"
            >
              {copiedPrivate ? 'Copied' : 'Copy link'}
            </button>
          </div>

          {/* Row 3: Public link */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]">
                  <span>Public link for anyone on the internet</span>
                  <Info className="w-3.5 h-3.5 text-[#94A3B8]" />
                </div>
                {conversation.public_link_enabled === 1 && (
                  <div className="text-[11px] font-mono text-[#059669] mt-0.5 truncate max-w-xs">
                    {publicUrl}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {conversation.public_link_enabled === 1 && (
                <button
                  onClick={() => copyText(publicUrl, setCopiedPublic)}
                  className="px-3 py-1.5 rounded-md bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-xs font-medium"
                >
                  {copiedPublic ? 'Copied' : 'Copy'}
                </button>
              )}
              <button
                onClick={() => onTogglePublicLink(conversation.public_link_enabled !== 1)}
                className="px-3 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] rounded-md transition-colors"
              >
                {conversation.public_link_enabled === 1 ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AiSummarizerModal: React.FC<{
  summary: string;
  loading: boolean;
  onClose: () => void;
  onSaveAsNote: (summaryText: string) => void;
}> = ({ summary, loading, onClose, onSaveAsNote }) => {
  const [editableSummary, setEditableSummary] = useState(summary);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  React.useEffect(() => {
    setEditableSummary(summary);
  }, [summary]);

  return (
    <div className="threadly-modal-backdrop fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <div className="threadly-modal-surface bg-white rounded-xl w-full max-w-lg p-6 border border-[#E2E8F0]">
        {/* Header matching Screenshot 000539.png */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center border border-[#FECACA]">
              <Wand2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#0F172A]">AI Summarizer</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#64748B] hover:text-[#0F172A] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Box */}
        <div className="mb-5">
          {loading ? (
            <div className="border border-[#CBD5E1] rounded-md p-6 text-xs text-[#64748B] text-center">
              Generating conversation summary...
            </div>
          ) : (
            <textarea
              rows={6}
              value={editableSummary}
              onChange={e => setEditableSummary(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded-md p-3.5 text-xs text-[#0F172A] leading-relaxed focus:outline-none focus:border-[#DC2626]"
            />
          )}
        </div>

        {/* Footer matching Screenshot 000539.png */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-[#475569]">
            <span>Was this summary helpful?</span>
            <button
              onClick={() => setFeedback('up')}
              className={`p-1 rounded ${
                feedback === 'up'
                  ? 'text-[#DC2626] bg-[#FEF2F2]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFeedback('down')}
              className={`p-1 rounded ${
                feedback === 'down'
                  ? 'text-[#DC2626] bg-[#FEF2F2]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            disabled={loading || !editableSummary.trim()}
            onClick={() => onSaveAsNote(editableSummary)}
            className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded-md shadow-sm transition-colors"
          >
            Save as note
          </button>
        </div>
      </div>
    </div>
  );
};

export const CreateTemplateModal: React.FC<{
  onClose: () => void;
  onCreated: () => void;
  currentUserName: string;
}> = ({ onClose, onCreated, currentUserName }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        category: category.trim() || 'General',
        subject: subject.trim(),
        body: body.trim(),
        created_by: currentUserName || 'Admin',
      }),
    });
    onCreated();
    onClose();
  };

  return (
    <div className="threadly-modal-backdrop fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <div className="threadly-modal-surface bg-white rounded-xl w-full max-w-md p-6 border border-[#E2E8F0]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#0F172A]">Create Email Template</h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Bulk Order Pricing Response"
              className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="General"
                className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Subject Line
              </label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Optional subject"
                className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Template Body (supports {'{{customer_name}}'} variable)
            </label>
            <textarea
              rows={5}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Hi {{customer_name}}, thank you for reaching out..."
              className="w-full border border-[#E2E8F0] rounded p-3 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded"
            >
              Save Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const CustomerPortalModal: React.FC<{
  conversation: any;
  onClose: () => void;
  onInsertText?: (text: string) => void;
  onUpdated?: () => void;
}> = ({ conversation, onClose, onInsertText, onUpdated }) => {
  const [kb, setKb] = useState<{ categories: any[]; articles: any[] }>({
    categories: [],
    articles: [],
  });
  const [rating, setRating] = useState(conversation?.csat_rating || '');
  const [comment, setComment] = useState(conversation?.csat_comment || '');
  const [savedCsat, setSavedCsat] = useState(false);

  React.useEffect(() => {
    fetch('/api/kb')
      .then(r => r.json())
      .then(setKb);
  }, []);

  const submitCsat = async () => {
    if (!conversation?.id || !rating) return;
    await fetch(`/api/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csat_rating: rating, csat_comment: comment }),
    });
    setSavedCsat(true);
    if (onUpdated) onUpdated();
  };

  return (
    <div className="threadly-modal-backdrop fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <div className="threadly-modal-surface bg-white rounded-xl w-full max-w-2xl p-6 border border-[#E2E8F0] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#DC2626]" />
            <h3 className="text-sm font-semibold text-[#0F172A]">
              Customer Self-Service Portal &amp; CSAT
            </h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {conversation && (
          <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[#0F172A] tabular-nums">
                Customer Portal View — Ticket #{conversation.conversation_code}
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF2F2] text-[#DC2626]">
                {conversation.status}
              </span>
            </div>
            <div className="text-xs text-[#475569]">
              Subject: <strong className="text-[#0F172A]">{conversation.subject}</strong>
            </div>

            {/* CSAT Survey */}
            <div className="pt-2 border-t border-[#E2E8F0]">
              <div className="text-xs font-medium text-[#0F172A] mb-2">
                Customer Satisfaction (CSAT) Survey
              </div>
              <div className="flex items-center gap-2 mb-2">
                {['Satisfied', 'Neutral', 'Unsatisfied'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setRating(opt)}
                    className={`px-3 py-1 rounded text-xs font-medium border ${
                      rating === opt
                        ? 'bg-[#DC2626] text-white border-[#DC2626]'
                        : 'bg-white text-[#334155] border-[#CBD5E1]'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Optional customer feedback..."
                  className="flex-1 border border-[#E2E8F0] bg-white rounded px-3 py-1.5 text-xs"
                />
                <button
                  onClick={submitCsat}
                  className="px-3.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded"
                >
                  {savedCsat ? 'Saved' : 'Record CSAT'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A] mb-3">
            <BookOpen className="w-4 h-4 text-[#DC2626]" />
            <span>Knowledge Base Articles</span>
          </div>
          {kb.articles.length === 0 ? (
            <div className="p-6 border border-dashed border-[#CBD5E1] rounded-lg text-center text-xs text-[#94A3B8]">
              No Knowledge Base articles published yet. Add articles in Admin Panel &rarr; Knowledge
              Base.
            </div>
          ) : (
            <div className="space-y-2">
              {kb.articles.map(art => (
                <div
                  key={art.id}
                  className="p-3.5 border border-[#E2E8F0] rounded-lg flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-semibold text-[#0F172A]">{art.title}</div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">{art.content}</div>
                  </div>
                  {onInsertText && (
                    <button
                      onClick={() => {
                        onInsertText(`${art.title}: ${art.content}`);
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-[#FEF2F2] text-[#DC2626] text-xs font-medium rounded shrink-0 ml-4"
                    >
                      Insert into reply
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const NewConversationModal: React.FC<{
  inboxes: any[];
  defaultChannel?: string;
  currentUserName: string;
  onClose: () => void;
  onCreated: (conv: any) => void;
}> = ({ inboxes, defaultChannel = 'email', currentUserName, onClose, onCreated }) => {
  const [inboxId, setInboxId] = useState<string>(inboxes[0]?.id ? String(inboxes[0].id) : '');
  const [channel, setChannel] = useState(defaultChannel);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !customerEmail.trim()) return;
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inbox_id: inboxId ? Number(inboxId) : null,
        channel,
        subject: subject.trim(),
        customer_name: customerName.trim() || customerEmail.split('@')[0],
        customer_email: customerEmail.trim(),
        body: body.trim(),
        actor_name: currentUserName || 'System',
      }),
    });
    const created = await res.json();
    onCreated(created);
    onClose();
  };

  return (
    <div className="threadly-modal-backdrop fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <div className="threadly-modal-surface bg-white rounded-xl w-full max-w-lg p-6 border border-[#E2E8F0]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#0F172A]">
            New / Inbound Conversation ({channel.toUpperCase()})
          </h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Target Shared Inbox
              </label>
              <select
                value={inboxId}
                onChange={e => setInboxId(e.target.value)}
                className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-xs"
              >
                <option value="">Default Shared Inbox</option>
                {inboxes.map(ib => (
                  <option key={ib.id} value={String(ib.id)}>
                    {ib.name} ({ib.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">Channel</label>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value)}
                className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-xs"
              >
                <option value="email">Email</option>
                <option value="chat">Live Chat</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="voice">Voice Call Log</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Sender / Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Amanda"
                className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Sender Email / Handle
              </label>
              <input
                type="email"
                required
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="e.g. Amanda@hiverdemo.com"
                className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">Subject</label>
            <input
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Bulk Order of coffee mugs"
              className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Message Content
            </label>
            <textarea
              rows={4}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Type message body..."
              className="w-full border border-[#E2E8F0] rounded p-3 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded"
            >
              Create Conversation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
