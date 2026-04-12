'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Heart, Copy, Check, X, Loader2, Mail } from 'lucide-react';

interface CompanionInviteProps {
  bookingId: string;
  existingCompanion?: {
    email: string;
    displayName: string | null;
    acceptedAt: string | null;
  } | null;
}

export default function CompanionInvite({ bookingId, existingCompanion }: CompanionInviteProps) {
  const t = useTranslations('Booking');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(existingCompanion?.email ?? '');
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState(false);

  const handleSendInvite = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/companion/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Błąd'); return; }
      setInviteUrl(data.acceptUrl);
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemove = async () => {
    setRemoving(true);
    const res = await fetch('/api/companion/invite', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId }),
    });
    if (res.ok) setRemoved(true);
    setRemoving(false);
  };

  if (removed) return null;

  // Already has companion
  if (existingCompanion && !removed) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl
        bg-rose-500/8 border border-rose-500/15 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Heart className="w-4 h-4 text-rose-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-htg-fg font-medium">
              {existingCompanion.displayName ?? existingCompanion.email}
            </span>
            {existingCompanion.acceptedAt ? (
              <span className="ml-2 text-xs text-htg-sage">zaakceptował/a</span>
            ) : (
              <span className="ml-2 text-xs text-htg-fg-muted">zaproszenie wysłane</span>
            )}
          </div>
        </div>
        {!existingCompanion.acceptedAt && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="shrink-0 p-1 rounded-full hover:bg-red-500/15 text-htg-fg-muted hover:text-red-400 transition-colors"
            title={t('remove_invite')}
          >
            {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
          bg-rose-500/10 hover:bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20
          text-sm font-medium transition-colors"
      >
        <Heart className="w-4 h-4" />
        Zaproś partnera/partnerkę
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 rounded-xl bg-rose-500/8 border border-rose-500/15 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-rose-400">
          <Heart className="w-4 h-4" />
          Zaproś do sesji
        </div>
        <button onClick={() => setOpen(false)} className="text-htg-fg-muted hover:text-htg-fg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {inviteUrl ? (
        <div className="space-y-2">
          <p className="text-xs text-htg-fg-muted">Link do zaproszenia — prześlij go partnerowi:</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 px-3 py-2 rounded-lg bg-htg-surface text-xs text-htg-fg-muted font-mono
                border border-htg-card-border focus:outline-none truncate"
            />
            <button
              onClick={copyLink}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-htg-surface
                hover:bg-htg-card text-htg-fg-muted text-xs border border-htg-card-border transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-htg-sage" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Skopiowano' : 'Kopiuj'}
            </button>
          </div>
          <p className="text-xs text-htg-fg-muted/60">
            Partner musi być zalogowany na koncie HTG, aby zaakceptować zaproszenie.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted/40" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('companion_email_placeholder')}
                onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-htg-surface border border-htg-card-border
                  text-sm text-htg-fg placeholder:text-htg-fg-muted/40 focus:outline-none focus:border-rose-500/40"
              />
            </div>
            <button
              onClick={handleSendInvite}
              disabled={loading || !email.trim()}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl
                bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm font-medium
                disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generuj link'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}
    </div>
  );
}
