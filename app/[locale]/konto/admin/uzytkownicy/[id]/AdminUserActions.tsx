'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, UserCog, BookOpen, Calendar, Users, RefreshCw, CheckCircle, Pencil } from 'lucide-react';

import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

interface Props {
  userId: string;
  userEmail: string;
  initialName?: string;
  initialPhone?: string;
  initialSecondEmail?: string;
}

type AddPurchaseType = 'session' | 'monthly' | 'yearly' | 'individual';

const INDIVIDUAL_TYPES = [
  { value: 'natalia_solo', label: SESSION_CONFIG['natalia_solo']?.label || 'natalia_solo' },
  { value: 'natalia_asysta', label: SESSION_CONFIG['natalia_asysta']?.label || 'natalia_asysta' },
  { value: 'natalia_agata', label: SESSION_CONFIG['natalia_agata']?.label || 'natalia_agata' },
  { value: 'natalia_para', label: SESSION_CONFIG['natalia_para']?.label || 'natalia_para' },
];

export default function AdminUserActions({ userId, userEmail, initialName = '', initialPhone = '', initialSecondEmail = '' }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'add_purchase' | 'change_role' | 'edit_profile' | null>(null);
  const [purchaseType, setPurchaseType] = useState<AddPurchaseType>('session');
  const [scopeMonth, setScopeMonth] = useState('');
  const [source, setSource] = useState('manual');
  const [notes, setNotes] = useState('');
  const [individualType, setIndividualType] = useState('natalia_solo');
  const [sessionDate, setSessionDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('confirmed_paid');
  const [newRole, setNewRole] = useState('user');
  const [editName, setEditName] = useState(initialName);
  const [editPhone, setEditPhone] = useState(initialPhone);
  const [editSecondEmail, setEditSecondEmail] = useState(initialSecondEmail);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleAddPurchase() {
    setSaving(true);
    setError('');
    setSuccess('');

    const res = await fetch('/api/admin/user-purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        purchaseType,
        scopeMonth: purchaseType === 'monthly' || purchaseType === 'yearly' ? scopeMonth : undefined,
        source,
        notes,
        individualType: purchaseType === 'individual' ? individualType : undefined,
        sessionDate: purchaseType === 'individual' ? sessionDate : undefined,
        startTime: purchaseType === 'individual' ? startTime : undefined,
        paymentStatus: purchaseType === 'individual' ? paymentStatus : undefined,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      setSuccess('Zakup został dodany pomyślnie!');
      setScopeMonth('');
      setNotes('');
      setTimeout(() => { setSuccess(''); setTab(null); }, 3000);
    } else {
      setError(data.error || 'Błąd dodawania zakupu');
    }
    setSaving(false);
  }

  async function handleChangeRole() {
    setSaving(true);
    setError('');
    setSuccess('');

    const res = await fetch('/api/admin/user-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    });

    const data = await res.json();
    if (res.ok) {
      setSuccess(`Rola zmieniona na "${newRole}"`);
      setTimeout(() => { setSuccess(''); setTab(null); }, 3000);
    } else {
      setError(data.error || 'Błąd zmiany roli');
    }
    setSaving(false);
  }

  async function handleEditProfile() {
    setSaving(true); setError(''); setSuccess('');
    const res = await fetch('/api/admin/user-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, displayName: editName, phone: editPhone, secondEmail: editSecondEmail }),
    });
    const data = await res.json();
    if (res.ok) {
      setSuccess('Dane zaktualizowane!');
      setTimeout(() => { setSuccess(''); setTab(null); router.refresh(); }, 2000);
    } else {
      setError(data.error || 'Błąd zapisu');
    }
    setSaving(false);
  }

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6 space-y-4">
      <h3 className="text-base font-semibold text-htg-fg flex items-center gap-2">
        <UserCog className="w-4 h-4 text-htg-indigo" />
        Akcje admina
      </h3>

      {/* Success / error */}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-500 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />{success}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* Action buttons */}
      {!tab && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setTab('edit_profile')}
            className="flex items-center gap-2 px-4 py-2 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo/90 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Edytuj dane
          </button>
          <button
            onClick={() => setTab('add_purchase')}
            className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Dodaj zakup
          </button>
          <button
            onClick={() => setTab('change_role')}
            className="flex items-center gap-2 px-4 py-2 bg-htg-surface border border-htg-card-border text-htg-fg rounded-xl text-sm font-medium hover:bg-htg-card-border transition-colors"
          >
            <UserCog className="w-4 h-4" />
            Zmień rolę
          </button>
        </div>
      )}

      {/* Edit profile form */}
      {tab === 'edit_profile' && (
        <div className="space-y-4 border-t border-htg-card-border pt-4">
          <h4 className="text-sm font-semibold text-htg-fg">Edytuj dane klienta</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Imię i nazwisko</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                placeholder="Jan Kowalski"
                className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-indigo/50" />
            </div>
            <div>
              <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Telefon</label>
              <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                placeholder="+48 600 000 000"
                className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-indigo/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Email główny</label>
              <input type="text" value={userEmail} disabled
                className="w-full px-3 py-2.5 bg-htg-surface/50 border border-htg-card-border rounded-xl text-htg-fg-muted text-sm cursor-not-allowed" />
              <p className="text-xs text-htg-fg-muted mt-1">Email główny jest zarządzany przez Supabase Auth — edytuj przez panel Supabase.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Email dodatkowy</label>
              <input type="email" value={editSecondEmail} onChange={e => setEditSecondEmail(e.target.value)}
                placeholder="alternatywny@email.pl"
                className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-indigo/50" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleEditProfile} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo/90 disabled:opacity-50 transition-colors">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              {saving ? 'Zapisywanie...' : 'Zapisz dane'}
            </button>
            <button onClick={() => { setTab(null); setError(''); }} className="px-5 py-2.5 bg-htg-surface text-htg-fg-muted rounded-xl text-sm font-medium hover:bg-htg-card-border transition-colors">
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Add purchase form */}
      {tab === 'add_purchase' && (
        <div className="space-y-4 border-t border-htg-card-border pt-4">
          <h4 className="text-sm font-semibold text-htg-fg">Dodaj zakup ręcznie</h4>

          {/* Purchase type */}
          <div>
            <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2 block">Typ zakupu</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { value: 'session', label: 'Sesja z biblioteki', icon: BookOpen },
                { value: 'monthly', label: 'Pakiet miesięczny', icon: Calendar },
                { value: 'yearly', label: 'Pakiet roczny', icon: Calendar },
                { value: 'individual', label: 'Sesja indywidualna', icon: Users },
              ] as const).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPurchaseType(value)}
                  className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                    purchaseType === value
                      ? 'bg-htg-sage/20 border-htg-sage text-htg-sage'
                      : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:border-htg-sage/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Month/year picker for monthly/yearly */}
          {(purchaseType === 'monthly' || purchaseType === 'yearly') && (
            <div>
              <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">
                {purchaseType === 'monthly' ? 'Miesiąc (YYYY-MM)' : 'Miesiąc startowy roczny (YYYY-MM)'}
              </label>
              <input
                type="month"
                value={scopeMonth}
                onChange={e => setScopeMonth(e.target.value)}
                className="px-4 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/50"
              />
            </div>
          )}

          {/* Individual session details */}
          {purchaseType === 'individual' && (
            <>
              <div>
                <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2 block">Typ sesji</label>
                <div className="grid grid-cols-2 gap-2">
                  {INDIVIDUAL_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setIndividualType(t.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors text-left ${
                        individualType === t.value
                          ? 'bg-htg-indigo/20 border-htg-indigo text-htg-indigo'
                          : 'bg-htg-surface border-htg-card-border text-htg-fg-muted'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Data sesji</label>
                  <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/50" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Godzina</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/50" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Status płatności</label>
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
                  className="px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm focus:outline-none w-full sm:w-auto">
                  <option value="confirmed_paid">Opłacona</option>
                  <option value="pending_verification">Do potwierdzenia</option>
                  <option value="installments">Raty</option>
                  <option value="partial_payment">Niepełna płatność</option>
                </select>
              </div>
            </>
          )}

          {/* Source */}
          <div>
            <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Źródło</label>
            <select value={source} onChange={e => setSource(e.target.value)}
              className="px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm focus:outline-none">
              <option value="manual">Ręczne (admin)</option>
              <option value="wix">WIX (migracja)</option>
              <option value="stripe">Stripe</option>
              <option value="migration">Migracja</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Notatka (opcjonalna)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Np. Przelew z 12.03.2025, nr ref: ..."
              className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/50" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleAddPurchase} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage/90 disabled:opacity-50 transition-colors">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Zapisywanie...' : 'Dodaj zakup'}
            </button>
            <button onClick={() => { setTab(null); setError(''); }} className="px-5 py-2.5 bg-htg-surface text-htg-fg-muted rounded-xl text-sm font-medium hover:bg-htg-card-border transition-colors">
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Change role form */}
      {tab === 'change_role' && (
        <div className="space-y-4 border-t border-htg-card-border pt-4">
          <h4 className="text-sm font-semibold text-htg-fg">Zmień rolę użytkownika</h4>
          <div>
            <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2 block">Nowa rola</label>
            <div className="flex flex-wrap gap-2">
              {(['user', 'moderator', 'admin', 'publikacja'] as const).map(r => (
                <button key={r} type="button" onClick={() => setNewRole(r)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    newRole === r
                      ? 'bg-htg-indigo/20 border-htg-indigo text-htg-indigo'
                      : 'bg-htg-surface border-htg-card-border text-htg-fg-muted'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleChangeRole} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo/90 disabled:opacity-50 transition-colors">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
              {saving ? 'Zapisywanie...' : 'Zapisz rolę'}
            </button>
            <button onClick={() => { setTab(null); setError(''); }} className="px-5 py-2.5 bg-htg-surface text-htg-fg-muted rounded-xl text-sm font-medium hover:bg-htg-card-border transition-colors">
              Anuluj
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
