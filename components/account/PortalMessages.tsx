'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { Mail, Send, ChevronLeft, PenSquare, Lock, Clock, CheckCircle2, Inbox } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/format';

interface Conversation {
  id: string;
  subject: string | null;
  status: string;
  last_message_at: string;
  last_snippet: string | null;
  unread_count: number;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  body_text: string | null;
  read_at: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Inbox; className: string }> = {
  open: { label: 'Otwarte', icon: Inbox, className: 'text-blue-600 bg-blue-50' },
  pending: { label: 'Odpowiedziano', icon: Clock, className: 'text-amber-600 bg-amber-50' },
  closed: { label: 'Zamknięte', icon: Lock, className: 'text-htg-fg-muted bg-htg-surface' },
};

function timeAgo(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'teraz';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDate(dateStr, locale, { day: 'numeric', month: 'short' });
}

// Simple auto-linkify: detect URLs and render as clickable links
// Whitelist: https, http, mailto only — no javascript:, data: etc.
function AutoLinkText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s<]+|mailto:[^\s<]+)/gi;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          // Reset lastIndex after test
          urlRegex.lastIndex = 0;
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-htg-sage underline hover:text-htg-sage-dark break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function PortalMessages() {
  const locale = useLocale();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // New message form
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [sendingNew, setSendingNew] = useState(false);

  // Reply form
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Auto-refresh: poll conversations every 15s + messages every 10s when thread open
  useEffect(() => {
    const interval = setInterval(() => { fetchConversations(); }, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => {
      fetch(`/api/portal/conversations/${selectedId}`)
        .then(r => r.json())
        .then(data => {
          setMessages(data.messages || []);
          setSelectedConv(data.conversation || null);
          // Mark new outbound as read
          fetch(`/api/portal/conversations/${selectedId}/read`, { method: 'POST' }).catch(() => {});
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedId]);

  // Fetch thread detail
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setSelectedConv(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/portal/conversations/${selectedId}`)
      .then(r => r.json())
      .then(data => {
        setMessages(data.messages || []);
        setSelectedConv(data.conversation || null);
        setLoadingDetail(false);
        // Mark as read (dedicated POST, not in GET)
        fetch(`/api/portal/conversations/${selectedId}/read`, { method: 'POST' }).catch(() => {});
        // Update local unread count
        setConversations(prev =>
          prev.map(c => c.id === selectedId ? { ...c, unread_count: 0 } : c)
        );
      })
      .catch(() => setLoadingDetail(false));
  }, [selectedId]);

  // Create new conversation
  const handleCreateConversation = async () => {
    const subject = newSubject.trim();
    const body = newBody.trim();
    if (!subject || !body) return;
    setSendingNew(true);
    try {
      const res = await fetch('/api/portal/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body_text: body }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowNew(false);
        setNewSubject('');
        setNewBody('');
        await fetchConversations();
        if (data.conversationId) setSelectedId(data.conversationId);
      } else {
        alert(data.error || 'Wystąpił błąd');
      }
    } catch { alert('Błąd sieci'); }
    setSendingNew(false);
  };

  // Send reply
  const handleReply = async () => {
    if (!selectedId || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/portal/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_text: replyText.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setReplyText('');
        // Refresh messages
        const detailRes = await fetch(`/api/portal/conversations/${selectedId}`);
        const detailData = await detailRes.json();
        setMessages(detailData.messages || []);
        setSelectedConv(detailData.conversation || null);
        fetchConversations();
      } else {
        alert(data.error || 'Wystąpił błąd');
      }
    } catch { alert('Błąd sieci'); }
    setSendingReply(false);
  };

  // --- Render ---

  // New message form
  if (showNew) {
    return (
      <div className="max-w-lg">
        <button
          onClick={() => setShowNew(false)}
          className="flex items-center gap-1 text-sm text-htg-fg-muted hover:text-htg-fg mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Wróć do listy
        </button>
        <h2 className="font-serif text-lg font-semibold text-htg-fg mb-4">Nowa wiadomość</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-htg-fg mb-1">Temat *</label>
            <input
              type="text"
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
              maxLength={100}
              placeholder="Temat Twojej wiadomości"
              className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage"
            />
            <p className="text-xs text-htg-fg-muted mt-1">{newSubject.length}/100</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-htg-fg mb-1">Wiadomość *</label>
            <textarea
              value={newBody}
              onChange={e => setNewBody(e.target.value)}
              maxLength={2000}
              rows={6}
              placeholder="Napisz krótką wiadomość do zespołu HTG..."
              className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage resize-none"
            />
            <p className="text-xs text-htg-fg-muted mt-1">{newBody.length}/2000</p>
          </div>
          <p className="text-xs text-htg-fg-muted">Odpowiemy w ciągu 24h.</p>
          <button
            onClick={handleCreateConversation}
            disabled={sendingNew || !newSubject.trim() || !newBody.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage-dark disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
            {sendingNew ? 'Wysyłanie...' : 'Wyślij wiadomość'}
          </button>
        </div>
      </div>
    );
  }

  // Thread detail view
  if (selectedId) {
    return (
      <div className="flex flex-col h-[calc(100vh-16rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => { setSelectedId(null); setReplyText(''); }}
            className="flex items-center gap-1 text-sm text-htg-fg-muted hover:text-htg-fg"
          >
            <ChevronLeft className="w-4 h-4" /> Wróć
          </button>
          {selectedConv && (
            <>
              <h2 className="font-serif text-lg font-semibold text-htg-fg truncate flex-1">
                {selectedConv.subject || '(bez tematu)'}
              </h2>
              {STATUS_CONFIG[selectedConv.status] && (
                <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${STATUS_CONFIG[selectedConv.status].className}`}>
                  {(() => { const Icon = STATUS_CONFIG[selectedConv.status].icon; return <Icon className="w-3 h-3" />; })()}
                  {STATUS_CONFIG[selectedConv.status].label}
                </span>
              )}
            </>
          )}
        </div>

        {/* Messages timeline */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {loadingDetail ? (
            <p className="text-sm text-htg-fg-muted">Ładowanie...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-htg-fg-muted">Brak wiadomości</p>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-xl p-3 ${
                  msg.direction === 'inbound'
                    ? 'bg-htg-sage/10 border border-htg-sage/20'
                    : 'bg-htg-surface border border-htg-card-border'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-htg-fg">
                      {msg.direction === 'inbound' ? 'Ty' : 'Zespół HTG'}
                    </span>
                    <span className="text-[10px] text-htg-fg-muted">
                      {formatDateTime(msg.created_at, locale, {
                        hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
                      })}
                    </span>
                  </div>
                  <div className="text-sm text-htg-fg whitespace-pre-wrap">
                    <AutoLinkText text={msg.body_text || '(brak treści)'} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Reply input or closed message */}
        {selectedConv?.status === 'closed' ? (
          <div className="p-4 rounded-lg bg-htg-surface border border-htg-card-border text-center">
            <Lock className="w-5 h-5 mx-auto mb-2 text-htg-fg-muted" />
            <p className="text-sm text-htg-fg-muted mb-2">Ta sprawa została zamknięta.</p>
            <button
              onClick={() => { setSelectedId(null); setShowNew(true); }}
              className="text-sm text-htg-sage hover:underline"
            >
              Napisz nową wiadomość
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              maxLength={2000}
              placeholder="Napisz odpowiedź..."
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage resize-none"
            />
            <button
              onClick={handleReply}
              disabled={sendingReply || !replyText.trim()}
              className="self-end px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage-dark disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              {sendingReply ? '...' : 'Wyślij'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Conversation list (default view)
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-htg-fg-muted">
          {conversations.length === 0 && !loading ? 'Nie masz jeszcze żadnych wiadomości.' : `${conversations.length} wątków`}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage-dark transition-colors"
        >
          <PenSquare className="w-4 h-4" />
          Nowa wiadomość
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-htg-fg-muted">Ładowanie...</p>
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => {
            const statusCfg = STATUS_CONFIG[conv.status];
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className="w-full text-left p-4 rounded-xl border border-htg-card-border bg-htg-card hover:bg-htg-surface transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-htg-fg truncate">
                        {conv.subject || '(bez tematu)'}
                      </span>
                      {conv.unread_count > 0 && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-htg-sage text-white font-medium">
                          Nowa odpowiedź
                        </span>
                      )}
                    </div>
                    {conv.last_snippet && (
                      <p className="text-xs text-htg-fg-muted mt-1 truncate">{conv.last_snippet}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-htg-fg-muted">{timeAgo(conv.last_message_at, locale)}</span>
                    {statusCfg && (
                      <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
