'use client';

import { useState, useTransition } from 'react';
import { ExternalLink } from 'lucide-react';
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

  // Deduplicate consents by type (show latest)
  const uniqueConsents = consents.reduce<ConsentRecord[]>((acc, c) => {
    if (!acc.find(a => a.consent_type === c.consent_type)) {
      acc.push(c);
    }
    return acc;
  }, []);

  const consentLabels: Record<string, string> = {
    sensitive_data: 'Dane wrażliwe (RODO art. 9)',
    marketing: 'Marketing',
    terms: 'Regulamin serwisu',
    digital_content: 'Treści cyfrowe',
  };

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
          {/* Static: Privacy policy — always shown with account creation date */}
          <ConsentRow
            label="Akceptacja Polityki prywatności (RODO)"
            date={accountCreatedAt}
            href="/privacy"
          />
          {/* Static: Terms of service — always shown with account creation date */}
          <ConsentRow
            label="Akceptacja Regulaminu serwisu"
            date={accountCreatedAt}
            href="/terms"
          />
          {/* Dynamic: any additional consent_records from DB */}
          {uniqueConsents
            .filter(c => !['terms', 'privacy'].includes(c.consent_type))
            .map((consent) => (
              <ConsentRow
                key={consent.id}
                label={consentLabels[consent.consent_type] || consent.consent_type}
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

function ConsentRow({ label, date, href }: { label: string; date: string; href?: string }) {
  const formatted = new Date(date).toLocaleDateString('pl', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex items-center justify-between bg-htg-surface rounded-lg p-3 gap-3">
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
          <p className="text-sm font-medium text-htg-fg">{label}</p>
        )}
        <p className="text-xs text-htg-fg-muted mt-0.5">Udzielona: {formatted}</p>
      </div>
      <span className="text-xs font-medium bg-htg-sage/10 text-htg-sage px-2 py-1 rounded shrink-0">
        Aktywna
      </span>
    </div>
  );
}
