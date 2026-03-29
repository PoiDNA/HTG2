'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw, CheckCircle, XCircle, Clock, FileText, ChevronDown,
  BookOpen, Users, Heart, Calendar, Download, MessageSquare, Paperclip,
} from 'lucide-react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type Request = {
  id: string;
  user_id: string;
  category: string;
  description: string;
  purchase_date: string | null;
  proof_url: string | null;
  proof_filename: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: {
    email: string;
    display_name: string | null;
  } | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  session_single: 'Sesja pojedyncza',
  session_monthly: 'Pakiet miesięczny',
  session_yearly: 'Pakiet roczny (12M)',
  individual_1on1: 'Sesja 1:1 z Natalią',
  individual_asysta: 'Sesja z Asystą',
  individual_para: 'Sesja dla Par',
};

const STATUS_CONFIG = {
  pending: { label: 'Oczekujące', icon: Clock, bg: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
  approved: { label: 'Zaakceptowane', icon: CheckCircle, bg: 'bg-green-500/10 text-green-500 border-green-500/30' },
  rejected: { label: 'Odrzucone', icon: XCircle, bg: 'bg-red-500/10 text-red-500 border-red-500/30' },
};

export default function AdminZgloszeniaPage() {
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => { loadRequests(); }, []);

  async function loadRequests() {
    setLoading(true);
    // Always fetch ALL to get correct counts
    const res = await fetch('/api/account-update?status=all');
    if (res.ok) {
      const data = await res.json();
      setAllRequests(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }

  // Filtered view
  const filteredRequests = filter === 'all'
    ? allRequests
    : allRequests.filter(r => r.status === filter);

  // Counts from ALL requests
  const pendingCount = allRequests.filter(r => r.status === 'pending').length;
  const approvedCount = allRequests.filter(r => r.status === 'approved').length;
  const rejectedCount = allRequests.filter(r => r.status === 'rejected').length;

  async function handleAction(id: string, status: 'approved' | 'rejected') {
    setProcessing(id);
    const res = await fetch('/api/account-update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, admin_notes: adminNotes[id] || '' }),
    });
    if (res.ok) {
      await loadRequests();
      setExpandedId(null);
    }
    setProcessing(null);
  }

  async function downloadProof(proofUrl: string) {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase.storage.from('account-proofs').createSignedUrl(proofUrl, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Zgłoszenia aktualizacji</h2>
          <p className="text-sm text-htg-fg-muted mt-1">
            Przeglądaj i akceptuj zgłoszenia brakujących zakupów od użytkowników
          </p>
        </div>
        <button
          onClick={loadRequests}
          className="p-2 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted"
          title="Odśwież"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats — always from ALL data */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: 'pending' as const, count: pendingCount },
          { key: 'approved' as const, count: approvedCount },
          { key: 'rejected' as const, count: rejectedCount },
        ]).map(({ key, count }) => {
          const sc = STATUS_CONFIG[key];
          const Icon = sc.icon;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`p-3 rounded-xl border text-center transition-colors ${
                filter === key ? sc.bg + ' border-current' : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:border-htg-fg-muted/50'
              }`}
            >
              <Icon className="w-5 h-5 mx-auto mb-1" />
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs">{sc.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {([
          { key: 'all' as const, label: `Wszystkie (${allRequests.length})` },
          { key: 'pending' as const, label: `Oczekujące (${pendingCount})` },
          { key: 'approved' as const, label: `Zaakceptowane (${approvedCount})` },
          { key: 'rejected' as const, label: `Odrzucone (${rejectedCount})` },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === key ? 'bg-htg-indigo text-white' : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Requests list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-htg-fg-muted" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12 text-htg-fg-muted">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Brak zgłoszeń{filter !== 'all' ? ` ze statusem "${STATUS_CONFIG[filter as keyof typeof STATUS_CONFIG]?.label || filter}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map(r => {
            const sc = STATUS_CONFIG[r.status];
            const Icon = sc.icon;
            const isExpanded = expandedId === r.id;
            const userDisplay = r.profiles?.display_name
              ? `${r.profiles.display_name} (${r.profiles.email})`
              : r.profiles?.email || r.user_id;

            return (
              <div key={r.id} className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-htg-surface/50 transition-colors"
                >
                  <Icon className={`w-5 h-5 shrink-0 ${r.status === 'pending' ? 'text-yellow-500' : r.status === 'approved' ? 'text-green-500' : 'text-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-htg-fg">{userDisplay}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${sc.bg}`}>{sc.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                        {CATEGORY_LABELS[r.category] || r.category}
                      </span>
                    </div>
                    <p className="text-sm text-htg-fg-muted truncate mt-0.5">{r.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.proof_url && <Paperclip className="w-4 h-4 text-htg-sage" title="Ma załącznik" />}
                    <span className="text-xs text-htg-fg-muted">{new Date(r.created_at).toLocaleDateString('pl')}</span>
                    <ChevronDown className={`w-4 h-4 text-htg-fg-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-htg-card-border pt-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1">Opis zgłoszenia</p>
                      <p className="text-sm text-htg-fg bg-htg-surface p-3 rounded-lg">{r.description}</p>
                    </div>

                    {r.purchase_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-htg-fg-muted" />
                        <span className="text-sm text-htg-fg">Data zakupu: {new Date(r.purchase_date).toLocaleDateString('pl')}</span>
                      </div>
                    )}

                    {r.proof_url && r.proof_filename && (
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-htg-sage" />
                        <button
                          onClick={() => downloadProof(r.proof_url!)}
                          className="text-sm text-htg-sage hover:underline flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          {r.proof_filename}
                        </button>
                      </div>
                    )}

                    {r.status === 'pending' ? (
                      <div>
                        <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">
                          <MessageSquare className="w-3 h-3 inline mr-1" />
                          Notatka admina (opcjonalna)
                        </label>
                        <textarea
                          value={adminNotes[r.id] || ''}
                          onChange={e => setAdminNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Wpisz komentarz dla użytkownika..."
                          rows={2}
                          className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/50 resize-none"
                        />
                      </div>
                    ) : r.admin_notes && (
                      <div>
                        <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1">Notatka admina</p>
                        <p className="text-sm text-htg-fg bg-htg-surface p-3 rounded-lg">{r.admin_notes}</p>
                      </div>
                    )}

                    {r.status === 'pending' && (
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => handleAction(r.id, 'approved')}
                          disabled={processing === r.id}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {processing === r.id ? 'Przetwarzanie...' : 'Zaakceptuj'}
                        </button>
                        <button
                          onClick={() => handleAction(r.id, 'rejected')}
                          disabled={processing === r.id}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          {processing === r.id ? 'Przetwarzanie...' : 'Odrzuć'}
                        </button>
                      </div>
                    )}

                    {r.reviewed_at && (
                      <p className="text-xs text-htg-fg-muted">
                        Rozpatrzone: {new Date(r.reviewed_at).toLocaleString('pl')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
