'use client';

import { useState, useTransition } from 'react';
import { ExternalLink, ShieldCheck, ShieldAlert, Lock } from 'lucide-react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

interface ConsentRecord {
  id: string;
  consent_type: string;
  granted: boolean;
  consent_text: string;
  created_at: string;
}

interface ProfileFormProps {
  email: string;
  displayName: string;
  phone: string;
  consents: ConsentRecord[];
  accountCreatedAt: string;
  labels: {
    name: string;
    email: string;
    phone: string;
    save: string;
    saved: string;
    gdprConsents: string;
    gdprGranted: string;
    gdprRevoke: string;
    deleteAccount: string;
  };
}

export function ProfileForm({ email, displayName, phone, consents, accountCreatedAt, labels }: ProfileFormProps) {
  const [name, setName] = useState(displayName);
  const [phoneVal, setPhoneVal] = useState(phone);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [localConsents, setLocalConsents] = useState(consents);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);

    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim() || null,
        phone: phoneVal.trim() || null,
      })
      .eq('id', user.id);

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  async function handleRevokeSensitiveData() {
    setRevoking(true);
    try {
      const supabase = createSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('consent_records').insert({
        consent_type: 'sensitive_data',
        granted: false,
        consent_text: 'Wycofanie zgody na przetwarzanie danych wrażliwych (RODO art. 9)',
      });

      setLocalConsents(prev => prev.filter(c => c.consent_type !== 'sensitive_data'));
      setShowRevokeConfirm(false);
    } finally {
      setRevoking(false);
    }
  }

  // Deduplicate consents by type (show latest)
  const uniqueConsents = localConsents.reduce<ConsentRecord[]>((acc, c) => {
    if (!acc.find(a => a.consent_type === c.consent_type)) {
      acc.push(c);
    }
    return acc;
  }, []);

  const hasSensitiveData = uniqueConsents.some(c => c.consent_type === 'sensitive_data' && c.granted);
  const hasRecordingConsent = uniqueConsents.some(c => c.consent_type === 'recording_publication' && c.granted);
  const sensitiveDataConsent = uniqueConsents.find(c => c.consent_type === 'sensitive_data' && c.granted);
  const recordingConsent = uniqueConsents.find(c => c.consent_type === 'recording_publication' && c.granted);

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-6">
      {/* Profile form */}
      <form onSubmit={handleSave} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-htg-fg">{labels.name}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-base"
            placeholder="Jan Kowalski"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-htg-fg">{labels.email}</span>
          <input
            type="email"
            value={email}
            className="mt-1 w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg-muted text-base cursor-not-allowed"
            disabled
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-htg-fg">{labels.phone}</span>
          <input
            type="tel"
            value={phoneVal}
            onChange={(e) => setPhoneVal(e.target.value)}
            className="mt-1 w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-base"
            placeholder="+48 000 000 000"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
          >
            {labels.save}
          </button>
          {saved && (
            <span className="text-htg-sage text-sm font-medium animate-in fade-in">
              ✓ {labels.saved}
            </span>
          )}
        </div>
      </form>

      {/* GDPR Consents */}
      <div className="border-t border-htg-card-border pt-6">
        <h3 className="text-lg font-semibold text-htg-fg mb-4">{labels.gdprConsents}</h3>
        <div className="space-y-3">

          {/* 1. Privacy policy — always shown, not revocable */}
          <ConsentRow
            label="Akceptacja Polityki prywatności (RODO)"
            date={accountCreatedAt}
            href="/privacy"
            status="locked"
          />

          {/* 2. Terms of service — always shown, not revocable */}
          <ConsentRow
            label="Akceptacja Regulaminu serwisu"
            date={accountCreatedAt}
            href="/terms"
            status="locked"
          />

          {/* 3. Sensitive data (art. 9 RODO) — revocable */}
          {hasSensitiveData && sensitiveDataConsent ? (
            <div className="bg-htg-surface rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-htg-fg inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-htg-sage shrink-0" />
                    Dane wrażliwe (RODO art. 9)
                  </p>
                  <p className="text-xs text-htg-fg-muted mt-0.5">
                    Udzielona: {new Date(sensitiveDataConsent.created_at).toLocaleDateString('pl', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium bg-htg-sage/10 text-htg-sage px-2 py-1 rounded">
                    Aktywna
                  </span>
                  <button
                    onClick={() => setShowRevokeConfirm(true)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Wycofaj
                  </button>
                </div>
              </div>
              <p className="text-xs text-htg-fg-muted mt-2">
                Zgoda na przetwarzanie danych dotyczących przekonań, zdrowia i życia osobistego ujawnianych w trakcie sesji.
              </p>

              {showRevokeConfirm && (
                <div className="mt-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-sm text-red-800 dark:text-red-300 mb-2">
                    <strong>Uwaga:</strong> Wycofanie tej zgody może uniemożliwić realizację kolejnych sesji HTG,
                    ponieważ ich charakter wymaga otwartości na tematy osobiste. Wycofanie nie wpływa
                    na zgodność z prawem przetwarzania dokonanego przed wycofaniem.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleRevokeSensitiveData}
                      disabled={revoking}
                      className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {revoking ? 'Wycofuję...' : 'Potwierdzam wycofanie'}
                    </button>
                    <button
                      onClick={() => setShowRevokeConfirm(false)}
                      className="text-xs text-htg-fg-muted px-3 py-1.5 rounded hover:bg-htg-surface"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-htg-surface rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-htg-fg-muted inline-flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                    Dane wrażliwe (RODO art. 9)
                  </p>
                  <p className="text-xs text-htg-fg-muted mt-0.5">
                    Wymagana przed pierwszą sesją
                  </p>
                </div>
                <span className="text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded shrink-0">
                  Brak
                </span>
              </div>
            </div>
          )}

          {/* 4. Recording & publication — not revocable (contract condition) */}
          {hasRecordingConsent && recordingConsent ? (
            <ConsentRow
              label="Nagrywanie i publikacja sesji"
              date={recordingConsent.created_at}
              status="locked"
              note="Warunek umowy — nie podlega wycofaniu. Możesz wskazać fragmenty do usunięcia w ciągu 7 dni od udostępnienia nagrania."
            />
          ) : (
            <div className="bg-htg-surface rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-htg-fg-muted inline-flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-htg-fg-muted shrink-0" />
                    Nagrywanie i publikacja sesji
                  </p>
                  <p className="text-xs text-htg-fg-muted mt-0.5">
                    Wyrażana przy rezerwacji sesji
                  </p>
                </div>
                <span className="text-xs font-medium bg-htg-surface text-htg-fg-muted px-2 py-1 rounded border border-htg-card-border shrink-0">
                  Oczekuje
                </span>
              </div>
            </div>
          )}

          {/* Dynamic: any other consent_records from DB */}
          {uniqueConsents
            .filter(c => !['terms', 'privacy', 'sensitive_data', 'recording_publication'].includes(c.consent_type) && c.granted)
            .map((consent) => (
              <ConsentRow
                key={consent.id}
                label={consent.consent_type === 'marketing' ? 'Marketing' : consent.consent_type}
                date={consent.created_at}
              />
            ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="border-t border-htg-card-border pt-6">
        <button className="text-red-600 dark:text-red-400 text-sm font-medium hover:underline">
          {labels.deleteAccount}
        </button>
      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function ConsentRow({ label, date, href, status, note }: {
  label: string;
  date: string;
  href?: string;
  status?: 'active' | 'locked';
  note?: string;
}) {
  const formatted = new Date(date).toLocaleDateString('pl', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const badgeClass = status === 'locked'
    ? 'bg-htg-surface text-htg-fg-muted border border-htg-card-border'
    : 'bg-htg-sage/10 text-htg-sage';

  return (
    <div className="bg-htg-surface rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-htg-fg hover:text-htg-indigo transition-colors inline-flex items-center gap-1"
            >
              {label}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <p className="text-sm font-medium text-htg-fg inline-flex items-center gap-1.5">
              {status === 'locked' && <Lock className="w-3.5 h-3.5 text-htg-fg-muted shrink-0" />}
              {label}
            </p>
          )}
          <p className="text-xs text-htg-fg-muted mt-0.5">Udzielona: {formatted}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${badgeClass}`}>
          {status === 'locked' ? 'Warunek umowy' : 'Aktywna'}
        </span>
      </div>
      {note && (
        <p className="text-xs text-htg-fg-muted mt-2">{note}</p>
      )}
    </div>
  );
}
