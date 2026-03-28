'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mail, Inbox, Clock, CheckCircle2, AlertTriangle, Ban,
  Search, Send, X, ChevronRight, Lightbulb, Paperclip,
  MessageSquare, RefreshCw,
} from 'lucide-react';
import CustomerCard from './CustomerCard';

interface ConversationSummary {
  id: string;
  subject: string | null;
  from_address: string;
  from_name: string | null;
  status: string;
  priority: string;
  ai_category: string | null;
  ai_sentiment: string | null;
  ai_summary: string | null;
  last_message_at: string;
  mailboxes?: { name: string; address: string } | null;
}

interface ConversationDetail {
  id: string;
  subject: string | null;
  from_address: string;
  from_name: string | null;
  to_address: string | null;
  status: string;
  priority: string;
  ai_category: string | null;
  ai_sentiment: string | null;
  ai_summary: string | null;
  ai_suggested_reply: string | null;
  user_id: string | null;
  user_link_verified: boolean;
  assigned_to: string | null;
  messages: any[];
  customerCard: any;
}

const STATUS_TABS = [
  { value: '', label: 'Wszystkie', icon: Mail },
  { value: 'open', label: 'Otwarte', icon: Inbox },
  { value: 'pending', label: 'Oczekujące', icon: Clock },
  { value: 'closed', label: 'Zamknięte', icon: CheckCircle2 },
  { value: 'spam', label: 'Spam', icon: Ban },
];

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-emerald-500',
  neutral: 'text-htg-fg-muted',
  negative: 'text-red-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-htg-surface text-htg-fg-muted',
  normal: 'bg-htg-surface text-htg-fg',
  high: 'bg-amber-500/10 text-amber-600',
  urgent: 'bg-red-500/10 text-red-500',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'teraz';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function EmailInbox() {
  // Thread list state
  const [threads, setThreads] = useState<ConversationSummary[]>([]);
  const [totalThreads, setTotalThreads] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Selected thread
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Compose
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // Fetch thread list
  const fetchThreads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (searchQuery) params.set('search', searchQuery);
    params.set('limit', '30');

    try {
      const res = await fetch(`/api/email/threads?${params}`);
      const data = await res.json();
      setThreads(data.threads || []);
      setTotalThreads(data.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter, searchQuery]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Fetch thread detail
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setLoadingDetail(true);
    fetch(`/api/email/threads/${selectedId}`)
      .then(r => r.json())
      .then(data => { setDetail(data); setLoadingDetail(false); })
      .catch(() => setLoadingDetail(false));
  }, [selectedId]);

  // Send reply
  const handleSend = async () => {
    if (!detail || !replyText.trim()) return;
    setSending(true);
    try {
      await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: detail.id,
          to: detail.from_address,
          subject: detail.subject,
          bodyText: replyText,
          bodyHtml: `<p>${replyText.replace(/\n/g, '<br/>')}</p>`,
        }),
      });
      setReplyText('');
      // Refresh detail
      const res = await fetch(`/api/email/threads/${detail.id}`);
      setDetail(await res.json());
      fetchThreads();
    } catch { /* ignore */ }
    setSending(false);
  };

  // Close thread
  const handleClose = async () => {
    if (!detail) return;
    await fetch(`/api/email/threads/${detail.id}/close`, { method: 'POST' });
    fetchThreads();
    setSelectedId(null);
  };

  // Use AI suggestion
  const useSuggestion = () => {
    if (detail?.ai_suggested_reply) {
      // Strip admin note if present
      const clean = detail.ai_suggested_reply.replace(/\[Uwaga.*?\]/g, '').trim();
      setReplyText(clean);
    }
  };

  // Send verification
  const handleVerify = async () => {
    if (!detail) return;
    const res = await fetch(`/api/email/threads/${detail.id}/verify-link`, { method: 'POST' });
    const data = await res.json();
    if (data.sent) alert('Link weryfikacyjny wysłany!');
    else alert(data.error || 'Błąd');
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-0 rounded-xl border border-htg-card-border overflow-hidden bg-htg-card">
      {/* Left panel: Filters + Thread list */}
      <div className="w-80 shrink-0 border-r border-htg-card-border flex flex-col">
        {/* Status tabs */}
        <div className="flex gap-1 p-3 border-b border-htg-card-border overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.value
                  ? 'bg-htg-sage text-white'
                  : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
              }`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-3 border-b border-htg-card-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Szukaj..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-xs focus:outline-none focus:ring-1 focus:ring-htg-sage"
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-htg-fg-muted text-xs">Ładowanie...</div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-center text-htg-fg-muted text-xs">Brak wątków</div>
          ) : (
            threads.map(thread => (
              <button
                key={thread.id}
                onClick={() => setSelectedId(thread.id)}
                className={`w-full text-left p-3 border-b border-htg-card-border hover:bg-htg-surface transition-colors ${
                  selectedId === thread.id ? 'bg-htg-surface' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {thread.priority === 'urgent' && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
                      {thread.priority === 'high' && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                      <span className="text-sm font-medium text-htg-fg truncate">
                        {thread.from_name || thread.from_address.split('@')[0]}
                      </span>
                    </div>
                    <p className="text-xs text-htg-fg-muted truncate mt-0.5">
                      {thread.subject || '(bez tematu)'}
                    </p>
                    {thread.ai_summary && (
                      <p className="text-xs text-htg-fg-muted/70 truncate mt-0.5 italic">
                        {thread.ai_summary}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-htg-fg-muted">{timeAgo(thread.last_message_at)}</span>
                    {thread.ai_category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-htg-surface text-htg-fg-muted">
                        {thread.ai_category}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-htg-card-border flex items-center justify-between">
          <span className="text-xs text-htg-fg-muted">{totalThreads} wątków</span>
          <button onClick={fetchThreads} className="p-1.5 rounded hover:bg-htg-surface text-htg-fg-muted">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center panel: Thread detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-htg-fg-muted">
            <div className="text-center">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Wybierz wątek z listy</p>
            </div>
          </div>
        ) : loadingDetail ? (
          <div className="flex-1 flex items-center justify-center text-htg-fg-muted text-sm">Ładowanie...</div>
        ) : detail ? (
          <>
            {/* Thread header */}
            <div className="p-4 border-b border-htg-card-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-serif font-semibold text-htg-fg truncate">{detail.subject || '(bez tematu)'}</h3>
                  <p className="text-xs text-htg-fg-muted mt-0.5">{detail.from_name || detail.from_address}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[detail.priority]}`}>
                    {detail.priority}
                  </span>
                  <button
                    onClick={handleClose}
                    className="text-xs px-2.5 py-1 rounded-lg border border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
                  >
                    Zamknij
                  </button>
                </div>
              </div>
              {/* AI labels */}
              {(detail.ai_category || detail.ai_sentiment) && (
                <div className="flex items-center gap-2 mt-2">
                  {detail.ai_category && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                      {detail.ai_category}
                    </span>
                  )}
                  {detail.ai_sentiment && (
                    <span className={`text-[10px] font-medium ${SENTIMENT_COLORS[detail.ai_sentiment] || ''}`}>
                      {detail.ai_sentiment}
                    </span>
                  )}
                  {detail.ai_summary && (
                    <span className="text-xs text-htg-fg-muted italic ml-1">— {detail.ai_summary}</span>
                  )}
                </div>
              )}
            </div>

            {/* Messages timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {detail.messages.map((msg: any) => (
                <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl p-3 ${
                    msg.direction === 'outbound'
                      ? 'bg-htg-sage/10 border border-htg-sage/20'
                      : msg.direction === 'internal'
                        ? 'bg-amber-500/5 border border-amber-500/20'
                        : 'bg-htg-surface border border-htg-card-border'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-htg-fg">
                        {msg.direction === 'outbound' ? 'HTG' : msg.direction === 'internal' ? 'Notatka' : msg.from_address}
                      </span>
                      <span className="text-[10px] text-htg-fg-muted">
                        {new Date(msg.created_at).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="text-sm text-htg-fg whitespace-pre-wrap">
                      {msg.body_text || '(brak treści)'}
                    </div>
                    {msg.attachments?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {msg.attachments.map((att: any, i: number) => (
                          <a
                            key={i}
                            href={att.signedUrl || '#'}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-1 text-xs text-htg-sage hover:underline bg-htg-card px-2 py-1 rounded"
                          >
                            <Paperclip className="w-3 h-3" />
                            {att.filename}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* AI suggestion */}
            {detail.ai_suggested_reply && (
              <div className="px-4 py-2 border-t border-htg-card-border bg-htg-sage/5">
                <button
                  onClick={useSuggestion}
                  className="flex items-start gap-2 text-left w-full group"
                >
                  <Lightbulb className="w-4 h-4 text-htg-sage shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-htg-sage mb-0.5">Sugestia AI — kliknij aby użyć</p>
                    <p className="text-xs text-htg-fg-muted line-clamp-2 group-hover:text-htg-fg transition-colors">
                      {detail.ai_suggested_reply.replace(/\[Uwaga.*?\]/g, '').trim()}
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* Compose */}
            <div className="p-3 border-t border-htg-card-border">
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Napisz odpowiedź..."
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage resize-none"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !replyText.trim()}
                  className="self-end px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage-dark disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  Wyślij
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Right panel: Customer Card */}
      {detail && (
        <div className="w-64 shrink-0 border-l border-htg-card-border p-4 overflow-y-auto">
          <CustomerCard
            card={detail.customerCard || null}
            isVerified={detail.user_link_verified}
            conversationId={detail.id}
            onLinkUser={() => {
              const email = prompt('Email lub ID użytkownika HTG:');
              if (!email) return;
              // Simple: search by email first
              fetch(`/api/email/threads/${detail.id}/link-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: email }), // TODO: search endpoint
              }).then(() => {
                // Refresh
                fetch(`/api/email/threads/${detail.id}`).then(r => r.json()).then(setDetail);
              });
            }}
            onSendVerification={handleVerify}
          />
        </div>
      )}
    </div>
  );
}
