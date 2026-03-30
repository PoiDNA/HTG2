'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail, Inbox, Clock, CheckCircle2, AlertTriangle, Ban,
  Search, Send, X, ChevronRight, Lightbulb, Paperclip,
  MessageSquare, RefreshCw, PenSquare, ChevronDown, FileUp, Trash2, UserCircle, Maximize2, Minimize2,
} from 'lucide-react';
import CustomerCard from './CustomerCard';
import TemplateInsert from './TemplateInsert';
import TemplateManager from './TemplateManager';

interface ConversationSummary {
  id: string;
  channel: string;
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
  channel: string;
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
  const [channelFilter, setChannelFilter] = useState<'' | 'email' | 'portal'>('');
  const [mailboxFilter, setMailboxFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Selected thread
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Compose (reply in thread)
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // New message compose
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeFrom, setComposeFrom] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [mailboxes, setMailboxes] = useState<{ id: string; name: string; address: string }[]>([]);

  // Autocomplete for "To" field
  const [toSuggestions, setToSuggestions] = useState<{ id: string; email: string; display_name: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Attachments (for compose + reply)
  const [composeAttachments, setComposeAttachments] = useState<{ filename: string; size: number; bunny_path: string; cdn_url: string }[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<{ filename: string; size: number; bunny_path: string; cdn_url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const composeFileRef = useRef<HTMLInputElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);

  // Template manager modal
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  // Customer card slideout
  const [showCustomerCard, setShowCustomerCard] = useState(false);

  // Fullscreen mode
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Role-based view
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState('');

  // Fetch thread list
  const fetchThreads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (channelFilter) params.set('channel', channelFilter);
    if (mailboxFilter) params.set('mailbox_id', mailboxFilter);
    if (searchQuery) params.set('search', searchQuery);
    params.set('limit', '30');

    try {
      const res = await fetch(`/api/email/threads?${params}`);
      const data = await res.json();
      setThreads(data.threads || []);
      setTotalThreads(data.total || 0);
      if (data.isAdmin !== undefined) setIsAdmin(data.isAdmin);
      if (data.userId) setUserId(data.userId);
      if (data.mailboxes?.length > 0 && mailboxes.length === 0) {
        setMailboxes(data.mailboxes);
        if (!composeFrom && data.mailboxes[0]) setComposeFrom(data.mailboxes[0].address);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter, channelFilter, mailboxFilter, searchQuery]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Autocomplete: search users as you type in "To" field
  useEffect(() => {
    if (composeTo.length < 2) { setToSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/email/search-users?q=${encodeURIComponent(composeTo)}`);
        const data = await res.json();
        setToSuggestions(data.users || []);
        setShowSuggestions(true);
      } catch { /* ignore */ }
    }, 300); // debounce 300ms
    return () => clearTimeout(timer);
  }, [composeTo]);

  // Fetch thread detail
  useEffect(() => {
    if (!selectedId) { setDetail(null); setShowCustomerCard(false); return; }
    setLoadingDetail(true);
    fetch(`/api/email/threads/${selectedId}`)
      .then(r => r.json())
      .then(data => { setDetail(data); setLoadingDetail(false); })
      .catch(() => setLoadingDetail(false));
  }, [selectedId]);

  // Send reply — portal vs email
  const handleSend = async () => {
    if (!detail || !replyText.trim()) return;
    setSending(true);
    try {
      if (detail.channel === 'portal') {
        // Portal reply — separate endpoint, plain text only
        await fetch('/api/portal/admin-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: detail.id,
            bodyText: replyText,
          }),
        });
      } else {
        // Email reply — existing endpoint
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: detail.id,
            to: detail.from_address,
            subject: detail.subject,
            bodyText: replyText,
            bodyHtml: `<p>${replyText.replace(/\n/g, '<br/>')}</p>`,
            attachments: replyAttachments.length > 0 ? replyAttachments : undefined,
          }),
        });
      }
      setReplyText('');
      setReplyAttachments([]);
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

  // Upload files handler
  const handleFileUpload = async (files: FileList, target: 'compose' | 'reply') => {
    if (files.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    for (const f of Array.from(files)) formData.append('files', f);
    try {
      const res = await fetch('/api/email/upload', { method: 'POST', body: formData });
      const data = await res.json();
      const uploaded = (data.files || []).filter((f: any) => !f.error);
      if (target === 'compose') setComposeAttachments(prev => [...prev, ...uploaded]);
      else setReplyAttachments(prev => [...prev, ...uploaded]);
    } catch { /* ignore */ }
    setUploading(false);
  };

  // Send new message (compose)
  const handleComposeSend = async () => {
    if (!composeTo.trim() || !composeBody.trim()) return;
    setComposeSending(true);
    try {
      const res = await fetch('/api/email/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeTo.trim(),
          from: composeFrom || undefined,
          subject: composeSubject.trim() || '(bez tematu)',
          bodyText: composeBody,
          bodyHtml: `<p>${composeBody.replace(/\n/g, '<br/>')}</p>`,
          attachments: composeAttachments.length > 0 ? composeAttachments : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCompose(false);
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        setComposeAttachments([]);
        fetchThreads();
        if (data.conversationId) setSelectedId(data.conversationId);
      } else {
        alert(data.error || 'Błąd wysyłki');
      }
    } catch { alert('Błąd sieci'); }
    setComposeSending(false);
  };

  return (
    <div className={`flex gap-0 overflow-hidden bg-htg-card ${
      isFullscreen
        ? 'fixed inset-0 z-50 h-screen'
        : 'h-[calc(100vh-4rem)] rounded-xl border border-htg-card-border'
    }`}>
      {/* Left panel: Filters + Thread list (full width on mobile when no thread selected) */}
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-72 lg:w-80 shrink-0 border-r border-htg-card-border flex-col`}>
        {/* Status tabs — icon-only with tooltip */}
        <div className="flex gap-1 p-2 border-b border-htg-card-border">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              title={tab.label}
              className={`relative group p-2 rounded-lg transition-colors ${
                statusFilter === tab.value
                  ? 'bg-htg-sage text-white'
                  : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {/* Tooltip */}
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[10px] font-medium bg-htg-fg text-htg-bg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {tab.label}
              </span>
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setShowCompose(true)}
            title="Nowa wiadomość"
            className="relative group p-2 rounded-lg bg-htg-sage text-white hover:bg-htg-sage-dark transition-colors"
          >
            <PenSquare className="w-4 h-4" />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[10px] font-medium bg-htg-fg text-htg-bg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Nowa wiadomość
            </span>
          </button>
        </div>

        {/* Search + Mailbox filter */}
        <div className="p-2 border-b border-htg-card-border space-y-2">
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
          {/* Channel filter */}
          <div className="flex gap-1 flex-wrap">
            {([
              { value: '' as const, label: 'Wszystkie', icon: Mail },
              { value: 'email' as const, label: 'Email', icon: Mail },
              { value: 'portal' as const, label: 'HTG', icon: MessageSquare },
            ]).map(ch => (
              <button
                key={ch.value}
                onClick={() => setChannelFilter(ch.value)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  channelFilter === ch.value
                    ? ch.value === 'portal' ? 'bg-teal-600 text-white' : 'bg-htg-sage text-white'
                    : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
                }`}
              >
                <ch.icon className="w-3 h-3" />
                {ch.label}
              </button>
            ))}
          </div>
          {/* Mailbox filter — show when multiple mailboxes */}
          {mailboxes.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setMailboxFilter('')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  !mailboxFilter ? 'bg-htg-sage text-white' : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
                }`}
              >
                Wszystkie
              </button>
              {mailboxes.map(mb => (
                <button
                  key={mb.id}
                  onClick={() => setMailboxFilter(mailboxFilter === mb.id ? '' : mb.id)}
                  title={mb.address}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors truncate max-w-[120px] ${
                    mailboxFilter === mb.id ? 'bg-htg-sage text-white' : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
                  }`}
                >
                  {mb.name}
                </button>
              ))}
            </div>
          )}
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
                      {isAdmin && thread.priority === 'urgent' && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
                      {isAdmin && thread.priority === 'high' && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                      <span className="text-sm font-medium text-htg-fg truncate">
                        {thread.from_name || thread.from_address.split('@')[0]}
                      </span>
                    </div>
                    <p className="text-xs text-htg-fg-muted truncate mt-0.5">
                      {thread.channel === 'portal' && (
                        <span className="inline-flex items-center gap-0.5 mr-1 text-[9px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-600">
                          <MessageSquare className="w-2.5 h-2.5" />HTG
                        </span>
                      )}
                      {thread.subject || '(bez tematu)'}
                      {isAdmin && !mailboxFilter && thread.channel !== 'portal' && thread.mailboxes?.name && (
                        <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-htg-card text-htg-fg-muted/60">
                          {thread.mailboxes.name}
                        </span>
                      )}
                    </p>
                    {isAdmin && thread.ai_summary && (
                      <p className="text-xs text-htg-fg-muted/70 truncate mt-0.5 italic">
                        {thread.ai_summary}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-htg-fg-muted">{timeAgo(thread.last_message_at)}</span>
                    {isAdmin && thread.ai_category && (
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
          <div className="flex items-center gap-1">
            <button onClick={fetchThreads} className="p-1.5 rounded hover:bg-htg-surface text-htg-fg-muted" title="Odśwież">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              className="p-1.5 rounded hover:bg-htg-surface text-htg-fg-muted"
              title={isFullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Center panel: Thread detail */}
      <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
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
            <div className="p-3 md:p-4 border-b border-htg-card-border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Back button (mobile) */}
                  <button
                    onClick={() => setSelectedId(null)}
                    className="md:hidden p-1 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface shrink-0"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                  </button>
                  <div className="min-w-0">
                    <h3 className="font-serif font-semibold text-htg-fg truncate text-sm md:text-base">{detail.subject || '(bez tematu)'}</h3>
                    <p className="text-xs text-htg-fg-muted mt-0.5">{detail.from_name || detail.from_address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[detail.priority]}`}>
                    {detail.priority}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => setShowCustomerCard(prev => !prev)}
                      className={`text-xs px-2.5 py-1 rounded-lg border border-htg-card-border transition-colors flex items-center gap-1 ${
                        showCustomerCard ? 'bg-htg-sage text-white border-htg-sage' : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
                      }`}
                    >
                      <UserCircle className="w-3.5 h-3.5" />
                      Klient
                    </button>
                  )}
                  <button
                    onClick={handleClose}
                    className="text-xs px-2.5 py-1 rounded-lg border border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
                  >
                    Zamknij
                  </button>
                </div>
              </div>
              {/* AI labels — admin only */}
              {isAdmin && (detail.ai_category || detail.ai_sentiment) && (
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

            {/* AI suggestion — admin only */}
            {isAdmin && detail.ai_suggested_reply && (
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

            {/* Compose reply */}
            <div className="p-3 border-t border-htg-card-border space-y-2">
              {/* Attachment list */}
              {replyAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {replyAttachments.map((att, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-htg-surface px-2 py-1 rounded border border-htg-card-border text-htg-fg">
                      <Paperclip className="w-3 h-3" />
                      {att.filename}
                      <button onClick={() => setReplyAttachments(prev => prev.filter((_, j) => j !== i))} className="text-htg-fg-muted hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Napisz odpowiedź..."
                rows={6}
                className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage resize-y min-h-[120px]"
                style={{ direction: 'ltr' }}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSend}
                  disabled={sending || !replyText.trim()}
                  className={`px-5 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-1.5 ${
                    detail.channel === 'portal' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-htg-sage hover:bg-htg-sage-dark'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {detail.channel === 'portal' ? 'Odpowiedz (HTG)' : 'Wyślij'}
                </button>
              </div>
              {/* Toolbar: template + attachment — hidden for portal (plain text only) */}
              {detail.channel !== 'portal' && (
              <div className="flex items-center gap-2">
                <TemplateInsert
                  userId={userId}
                  onInsert={(text) => setReplyText(prev => prev + text)}
                  onManage={() => setShowTemplateManager(true)}
                />
                <button
                  type="button"
                  onClick={() => replyFileRef.current?.click()}
                  disabled={uploading}
                  title="Dodaj załącznik"
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface border border-htg-card-border transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{uploading ? 'Wgrywanie...' : 'Załącznik'}</span>
                </button>
                <input
                  ref={replyFileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files) handleFileUpload(e.target.files, 'reply'); e.target.value = ''; }}
                />
              </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Customer Card — slideout panel (on demand) */}
      {isAdmin && detail && showCustomerCard && (
        <div className="fixed inset-y-0 right-0 z-40 w-80 bg-htg-card border-l border-htg-card-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between p-3 border-b border-htg-card-border">
            <h3 className="text-sm font-semibold text-htg-fg flex items-center gap-1.5">
              <UserCircle className="w-4 h-4" />
              Karta klienta
            </h3>
            <button
              onClick={() => setShowCustomerCard(false)}
              className="p-1 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <CustomerCard
              card={detail.customerCard || null}
              isVerified={detail.user_link_verified}
              conversationId={detail.id}
              onLinkUser={() => {
                const email = prompt('Email lub ID użytkownika HTG:');
                if (!email) return;
                fetch(`/api/email/threads/${detail.id}/link-user`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: email }),
                }).then(() => {
                  fetch(`/api/email/threads/${detail.id}`).then(r => r.json()).then(setDetail);
                });
              }}
              onSendVerification={handleVerify}
            />
          </div>
        </div>
      )}
      {/* Template manager modal */}
      {showTemplateManager && (
        <TemplateManager
          onClose={() => setShowTemplateManager(false)}
          isAdmin={isAdmin}
          userId={userId}
        />
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-htg-card border border-htg-card-border rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-htg-card-border">
              <h3 className="font-serif font-semibold text-htg-fg flex items-center gap-2">
                <PenSquare className="w-4 h-4" />
                Nowa wiadomość
              </h3>
              <button onClick={() => setShowCompose(false)} className="text-htg-fg-muted hover:text-htg-fg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* From (mailbox selector) */}
              {mailboxes.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-htg-fg-muted block mb-1">Od</label>
                  <select
                    value={composeFrom}
                    onChange={e => setComposeFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage"
                  >
                    {mailboxes.map(mb => (
                      <option key={mb.id} value={mb.address}>{mb.name} ({mb.address})</option>
                    ))}
                  </select>
                </div>
              )}
              {/* To — with autocomplete */}
              <div className="relative">
                <label className="text-xs font-medium text-htg-fg-muted block mb-1">Do *</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={e => { setComposeTo(e.target.value); setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Zacznij pisać email lub imię..."
                  className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage"
                  autoFocus
                />
                {showSuggestions && toSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-htg-card border border-htg-card-border rounded-lg shadow-xl z-10 max-h-40 overflow-y-auto">
                    {toSuggestions.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); setComposeTo(u.email); setShowSuggestions(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-htg-surface transition-colors flex items-center gap-2"
                      >
                        <div className="w-6 h-6 rounded-full bg-htg-sage/20 flex items-center justify-center text-xs font-medium text-htg-sage shrink-0">
                          {(u.display_name || u.email)[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          {u.display_name && <p className="text-sm text-htg-fg truncate">{u.display_name}</p>}
                          <p className="text-xs text-htg-fg-muted truncate">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-htg-fg-muted block mb-1">Temat</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  placeholder="Temat wiadomości"
                  className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage"
                />
              </div>
              {/* Body */}
              <div>
                <label className="text-xs font-medium text-htg-fg-muted block mb-1">Treść *</label>
                <textarea
                  value={composeBody}
                  onChange={e => setComposeBody(e.target.value)}
                  rows={6}
                  placeholder="Napisz wiadomość..."
                  className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage resize-none"
                />
              </div>
              {/* Toolbar: template + attachment */}
              <div className="flex items-center gap-2">
                <TemplateInsert
                  userId={userId}
                  onInsert={(text) => setComposeBody(prev => prev + text)}
                  onManage={() => setShowTemplateManager(true)}
                />
                <button
                  type="button"
                  onClick={() => composeFileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface border border-htg-card-border transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Wgrywanie...' : 'Załącznik'}</span>
                </button>
                <input
                  ref={composeFileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files) handleFileUpload(e.target.files, 'compose'); e.target.value = ''; }}
                />
              </div>
              {/* Attachment list */}
              {composeAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {composeAttachments.map((att, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-htg-surface px-2 py-1 rounded border border-htg-card-border text-htg-fg">
                      <Paperclip className="w-3 h-3" />
                      {att.filename} <span className="text-htg-fg-muted">({(att.size / 1024).toFixed(0)}KB)</span>
                      <button onClick={() => setComposeAttachments(prev => prev.filter((_, j) => j !== i))} className="text-htg-fg-muted hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-htg-card-border">
              <button
                onClick={() => setShowCompose(false)}
                className="px-4 py-2 text-sm rounded-lg border border-htg-card-border text-htg-fg-muted hover:text-htg-fg transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleComposeSend}
                disabled={composeSending || !composeTo.trim() || !composeBody.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-htg-sage text-white font-medium hover:bg-htg-sage-dark disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
                {composeSending ? 'Wysyłanie...' : 'Wyślij'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
