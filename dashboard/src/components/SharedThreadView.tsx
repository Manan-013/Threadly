import React, { useEffect, useState } from 'react';
import { ThreadlyHexIcon } from './ThreadlyBrandIcon';

interface SharedMessage {
  id: number;
  sender_name: string;
  is_agent_reply: number;
  body: string;
  created_at: string;
}

interface SharedConversation {
  conversation_code: string;
  subject: string;
  customer_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  messages: SharedMessage[];
}

/**
 * Public, read-only view of a conversation opened through a share link (?shared=<token>).
 * It needs no login and only ever renders the redacted payload of GET /api/shared/:token:
 * no internal notes, activity log, assignee details or private replies.
 */
export const SharedThreadView: React.FC<{ token: string }> = ({ token }) => {
  const [conversation, setConversation] = useState<SharedConversation | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shared/${encodeURIComponent(token)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data && data.conversation_code) {
          setConversation(data);
          setState('ready');
        } else {
          setState('unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center p-4 antialiased text-[#0F172A]">
      <div className="w-full max-w-2xl space-y-5 pt-8">
        <div className="inline-flex items-center gap-2.5">
          <ThreadlyHexIcon size={28} />
          <span className="font-brand text-xl font-extrabold tracking-tight">
            Thread<span className="text-[#DC2626]">ly</span>
          </span>
        </div>

        {state === 'loading' && <p className="text-sm text-[#64748B]">Loading conversation…</p>}

        {state === 'unavailable' && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6">
            <h1 className="text-base font-bold">This link is unavailable</h1>
            <p className="text-sm text-[#64748B] mt-1">
              The conversation was not found, or its public link has been turned off.
            </p>
          </div>
        )}

        {state === 'ready' && conversation && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 space-y-5">
            <div>
              <div className="text-[11px] font-semibold text-[#64748B]">
                {conversation.conversation_code} · {conversation.status}
              </div>
              <h1 className="text-lg font-bold">{conversation.subject}</h1>
            </div>
            <ul className="space-y-4">
              {conversation.messages.map(m => (
                <li key={m.id} className="border-t border-[#F1F5F9] pt-4 first:border-0 first:pt-0">
                  <div className="text-xs font-semibold">
                    {m.sender_name}
                    {m.is_agent_reply ? <span className="ml-2 text-[#64748B]">(Support team)</span> : null}
                  </div>
                  <div className="text-[11px] text-[#94A3B8]">{m.created_at}</div>
                  <p className="mt-1.5 text-sm whitespace-pre-wrap break-words">{m.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
