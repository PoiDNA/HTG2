'use client';

import { useState, useEffect, useRef } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import {
  RefreshCw, Plus, Upload, Calendar, FileText, CheckCircle, XCircle, Clock,
  BookOpen, Users, Heart, X, Paperclip,
} from 'lucide-react';

type Request = {
  id: string;
  category: string;
  description: string;
  purchase_date: string | null;
  proof_url: string | null;
  proof_filename: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  created_at: string;
};

type Entitlement = {
  id: string;
  type: string;
  scope_month: string | null;
  source: string;
  created_at: string;
};

type Booking = {
  id: string;
  session_type: string;
  session_date: string;
  start_time: string;
  status: string;
  payment_status: string | null;
};

const CATEGORIES = [
  { value: 'session_single', label: 'Sesja pojedyncza', group: 'Biblioteka Sesji', icon: BookOpen },
  { value: 'session_monthly', label: 'Pakiet miesięczny', group: 'Biblioteka Sesji', icon: Calendar },
  { value: 'session_yearly', label: 'Pakiet roczny (12M)', group: 'Biblioteka Sesji', icon: Calendar },
  { value: 'individual_1on1', label: 'Sesja 1:1 z Natalią', group: 'Sesje indywidualne', icon: Users },
  { value: 'individual_asysta', label: 'Sesja z Asystą', group: 'Sesje indywidualne', icon: Users },
  { value: 'individual_para', label: 'Sesja dla Par', group: 'Sesje indywidualne', icon: Heart },
] as const;

const STATUS_CONFIG = {
  pending: { label: 'W oczekiwaniu', icon: Clock, color: 'text-yellow-500 bg-yellow-500/10 border border-yellow-500/30' },
  approved: { label: 'Zaakceptowano', icon: CheckCircle, color: 'text-green-500 bg-green-500/10 border border-green-500/30' },
  rejected: { label: 'Odrzucono', icon: XCircle, color: 'text-red-500 bg-red-500/10 border border-red-500/30' },
};

import { SESSION_CONFIG, PAYMENT_STATUS_LABELS } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export default function AccountUpdatePage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Form state
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [reqRes, entRes, bookRes] = await Promise.all([
      fetch('/api/account-update'),
      supabase.from('entitlements').select('id, type, scope_month, source, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('bookings').select('id, session_type, session_date, start_time, status, payment_status').eq('user_id', user.id).order('session_date', { ascending: false }),
    ]);

    if (reqRes.ok) {
      const data = await reqRes.json();
      setRequests(Array.isArray(data) ? data : []);
    }
    if (entRes.data) setEntitlements(entRes.data);
    if (bookRes.data) setBookings(bookRes.data as Booking[]);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !description) return;
    setSubmitting(true);
    setSubmitSuccess(false);

    let proof_url: string | null = null;
    let proof_filename: string | null = null;

    // Upload proof file if provided
    if (proofFile) {
      const supabase = createSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const ext = proofFile.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from('account-proofs')
          .upload(path, proofFile);
        if (!error) {
          proof_url = path;
          proof_filename = proofFile.name;
        }
      }
    }

    const res = await fetch('/api/account-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        description,
        purchase_date: purchaseDate || null,
        proof_url,
        proof_filename,
      }),
    });

    if (res.ok) {
      setShowForm(false);
      setCategory('');
      setDescription('');
      setPurchaseDate('');
      setProofFile(null);
      setSubmitSuccess(true);
      await loadData();
      setTimeout(() => setSubmitSuccess(false), 5000);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Błąd: ${err.error || 'Nie udało się wysłać zgłoszenia'}`);
    }
    setSubmitting(false);
  }

  const formatSessionType = (t: string) => {
    return SESSION_CONFIG[t as SessionType]?.label || t;
  };

  const formatEntitlementType = (e: Entitlement) => {
    if (e.type === 'session') return 'Sesja pojedyncza';
    if (e.type === 'monthly') return `Pakiet miesięczny (${e.scope_month})`;
    if (e.type === 'yearly') return 'Pakiet roczny';
    if (e.type === 'booking') return 'Sesja indywidualna';
    return e.type;
  };

  const formatCategoryLabel = (cat: string) =>
    CATEGORIES.find(c => c.value === cat)?.label || cat;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-htg-fg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Aktualizacja Konta</h2>
          <p className="text-sm text-htg-fg-muted mt-1">
            Zgłoś brakujące zakupy z poprzedniego systemu (WIX)
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Zgłoś brakujący zakup
          </button>
        )}
      </div>

      {/* Success message */}
      {submitSuccess && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-500">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">Zgłoszenie zostało wysłane! Oczekuj na weryfikację przez admina.</p>
        </div>
      )}

      {/* Requests section — always visible */}
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-htg-fg mb-4">
          Twoje zgłoszenia {requests.length > 0 && `(${requests.length})`}
        </h3>
        {requests.length === 0 ? (
          <p className="text-sm text-htg-fg-muted py-4 text-center">
            Nie masz jeszcze żadnych zgłoszeń. Kliknij &quot;Zgłoś brakujący zakup&quot; aby dodać.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map(r => {
              const sc = STATUS_CONFIG[r.status];
              const Icon = sc.icon;
              return (
                <div key={r.id} className={`rounded-xl p-4 ${sc.color}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4" />
                        <span className="text-sm font-bold">{sc.label}</span>
                        <span className="text-xs opacity-60">·</span>
                        <span className="text-xs font-medium opacity-80">{formatCategoryLabel(r.category)}</span>
                      </div>
                      <p className="text-sm text-htg-fg mt-1">{r.description}</p>
                      {r.purchase_date && (
                        <p className="text-xs text-htg-fg-muted mt-1">
                          Data zakupu: {new Date(r.purchase_date).toLocaleDateString('pl')}
                        </p>
                      )}
                      {r.proof_filename && (
                        <p className="text-xs text-htg-fg-muted mt-1 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          {r.proof_filename}
                        </p>
                      )}
                      {r.admin_notes && (
                        <div className="mt-3 p-3 bg-htg-surface rounded-lg border border-htg-card-border">
                          <p className="text-xs font-semibold text-htg-fg-muted mb-1">Odpowiedź admina:</p>
                          <p className="text-sm text-htg-fg">{r.admin_notes}</p>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-htg-fg-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString('pl')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New request form */}
      {showForm && (
        <div className="bg-htg-card border-2 border-htg-sage/30 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-htg-fg">Nowe zgłoszenie</h3>
            <button onClick={() => { setShowForm(false); setProofFile(null); }} className="p-1 rounded-lg hover:bg-htg-surface">
              <X className="w-5 h-5 text-htg-fg-muted" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-htg-fg mb-2">Co kupiłeś/aś?</label>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">Biblioteka Sesji</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CATEGORIES.filter(c => c.group === 'Biblioteka Sesji').map(c => {
                    const Icon = c.icon;
                    return (
                      <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                          category === c.value
                            ? 'bg-htg-sage/20 border-htg-sage text-htg-sage'
                            : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:border-htg-sage/50'
                        }`}>
                        <Icon className="w-4 h-4" />{c.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mt-3">Sesje indywidualne</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CATEGORIES.filter(c => c.group === 'Sesje indywidualne').map(c => {
                    const Icon = c.icon;
                    return (
                      <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                          category === c.value
                            ? 'bg-htg-indigo/20 border-htg-indigo text-htg-indigo'
                            : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:border-htg-indigo/50'
                        }`}>
                        <Icon className="w-4 h-4" />{c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-htg-fg mb-1">Opis zakupu</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Np. Kupiłem pakiet miesięczny za kwiecień 2025 na WIX..."
                rows={3}
                className="w-full px-4 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/50 resize-none"
                required />
            </div>

            {/* Purchase date */}
            <div>
              <label className="block text-sm font-medium text-htg-fg mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />Data zakupu (przybliżona)
              </label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                className="w-full sm:w-auto px-4 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/50" />
            </div>

            {/* Proof upload */}
            <div>
              <label className="block text-sm font-medium text-htg-fg mb-1">
                <Upload className="w-4 h-4 inline mr-1" />Potwierdzenie zakupu (opcjonalne)
              </label>
              <input ref={fileRef} type="file" accept="image/*,.pdf"
                onChange={e => setProofFile(e.target.files?.[0] || null)}
                className="hidden" />
              {proofFile ? (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 border border-green-500/30 rounded-xl text-sm">
                  <Paperclip className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-green-500 font-medium truncate">{proofFile.name}</span>
                  <span className="text-green-500/60 text-xs shrink-0">({(proofFile.size / 1024).toFixed(0)} KB)</span>
                  <button type="button" onClick={() => { setProofFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="ml-auto p-1 hover:bg-green-500/20 rounded-lg shrink-0">
                    <X className="w-4 h-4 text-green-500" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-htg-surface border border-dashed border-htg-card-border rounded-xl text-sm text-htg-fg-muted hover:border-htg-sage/50 transition-colors w-full sm:w-auto">
                  <Upload className="w-4 h-4" />Wybierz plik (screenshot, PDF)...
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={!category || !description || submitting}
                className="px-6 py-2.5 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Wysyłanie...' : 'Wyślij zgłoszenie'}
              </button>
              <button type="button"
                onClick={() => { setShowForm(false); setCategory(''); setDescription(''); setPurchaseDate(''); setProofFile(null); }}
                className="px-6 py-2.5 bg-htg-surface text-htg-fg-muted rounded-xl text-sm font-medium hover:bg-htg-card-border transition-colors">
                Anuluj
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Current purchases */}
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-htg-fg mb-4">Twoje rozpoznane zakupy</h3>
        {entitlements.length === 0 && bookings.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">System nie rozpoznaje jeszcze żadnych zakupów na Twoim koncie.</p>
        ) : (
          <div className="space-y-4">
            {entitlements.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">Biblioteka Sesji</h4>
                <div className="space-y-1">
                  {entitlements.map(e => (
                    <div key={e.id} className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-htg-sage" />
                        <span className="text-sm text-htg-fg">{formatEntitlementType(e)}</span>
                      </div>
                      <span className="text-xs text-htg-fg-muted">
                        {e.source === 'wix' ? 'z WIX' : e.source === 'stripe' ? 'Stripe' : e.source}
                        {' · '}{new Date(e.created_at).toLocaleDateString('pl')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bookings.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">Sesje indywidualne</h4>
                <div className="space-y-1">
                  {bookings.slice(0, 10).map(b => (
                    <div key={b.id} className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-htg-indigo" />
                        <span className="text-sm text-htg-fg">{formatSessionType(b.session_type)}</span>
                        <span className="text-xs text-htg-fg-muted">{b.session_date} {b.start_time}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        b.payment_status === 'confirmed_paid' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {PAYMENT_STATUS_LABELS[b.payment_status ?? ''] || b.payment_status || 'Do potwierdzenia'}
                      </span>
                    </div>
                  ))}
                  {bookings.length > 10 && (
                    <p className="text-xs text-htg-fg-muted pl-3">...i {bookings.length - 10} więcej</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
