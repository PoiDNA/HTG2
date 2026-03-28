'use client';

import { useState } from 'react';
import { Copy, Check, Gift, Send, Undo2, Users, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface GiftItem {
  id: string;
  recipient_email: string;
  purchased_by?: string;
  status: 'pending' | 'claimed' | 'revoked';
  claim_token: string;
  message?: string | null;
  claimed_at?: string | null;
  created_at: string;
  entitlements: {
    id: string;
    type: string;
    valid_until: string;
    products?: { name: string } | null;
  };
}

interface Props {
  sentGifts: GiftItem[];
  receivedGifts: GiftItem[];
  baseUrl: string;
  locale: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'claimed') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> Odebrana
    </span>
  );
  if (status === 'revoked') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> Odwołana
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> Oczekująca
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-htg-surface hover:bg-htg-card border border-htg-card-border text-htg-fg-muted hover:text-htg-fg transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Skopiowano' : 'Kopiuj link'}
    </button>
  );
}

function TransferModal({ gift, onClose, onSuccess }: {
  gift: GiftItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const transfer = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gift/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId: gift.id, recipientEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Błąd'); return; }
      onSuccess();
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
        <h3 className="font-serif font-semibold text-htg-fg">Przekaż sesję</h3>
        <p className="text-sm text-htg-fg-muted">
          Podaj email osoby, której chcesz przekazać sesję. Musi mieć konto HTG.
        </p>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="email@przyklad.pl"
          className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-warm/40"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-htg-card-border text-htg-fg-muted hover:text-htg-fg transition-colors">
            Anuluj
          </button>
          <button
            onClick={transfer}
            disabled={loading || !email.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-htg-warm text-white hover:bg-htg-warm/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Przekazywanie…' : 'Przekaż'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SentGiftCard({ gift, baseUrl, onRefresh }: {
  gift: GiftItem;
  baseUrl: string;
  onRefresh: () => void;
}) {
  const [transferring, setTransferring] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const claimUrl = `${baseUrl}/pl/konto/odbierz-prezent/${gift.claim_token}`;
  const productName = gift.entitlements?.products?.name ?? gift.entitlements?.type ?? 'Sesja';

  const revoke = async () => {
    if (!confirm('Odwołać prezent? Sesja wróci na Twoje konto.')) return;
    setRevoking(true);
    try {
      await fetch('/api/gift/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId: gift.id }),
      });
      onRefresh();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-htg-card-border bg-htg-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-htg-fg truncate">{productName}</p>
          <p className="text-xs text-htg-fg-muted">
            Dla: <span className="text-htg-fg">{gift.recipient_email}</span>
          </p>
          <p className="text-xs text-htg-fg-muted mt-0.5">
            {format(new Date(gift.created_at), 'd MMM yyyy', { locale: pl })}
          </p>
        </div>
        <StatusBadge status={gift.status} />
      </div>

      {gift.message && (
        <p className="text-xs text-htg-fg-muted italic border-l-2 border-htg-warm/30 pl-2">
          {gift.message}
        </p>
      )}

      {gift.status === 'pending' && (
        <div className="flex flex-wrap gap-2 pt-1">
          <CopyButton text={claimUrl} />
          <button
            onClick={() => setTransferring(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-htg-surface hover:bg-htg-card border border-htg-card-border text-htg-fg-muted hover:text-htg-fg transition-colors"
          >
            <Send className="w-3 h-3" /> Przekaż ręcznie
          </button>
          <button
            onClick={revoke}
            disabled={revoking}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-colors disabled:opacity-50"
          >
            <Undo2 className="w-3 h-3" /> Odwołaj
          </button>
        </div>
      )}

      {gift.status === 'claimed' && gift.claimed_at && (
        <p className="text-xs text-htg-fg-muted">
          Odebrana {format(new Date(gift.claimed_at), 'd MMM yyyy', { locale: pl })}
        </p>
      )}

      {transferring && (
        <TransferModal
          gift={gift}
          onClose={() => setTransferring(false)}
          onSuccess={() => { setTransferring(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

function ReceivedGiftCard({ gift, locale, onRefresh }: {
  gift: GiftItem;
  locale: string;
  onRefresh: () => void;
}) {
  const [claiming, setClaiming] = useState(false);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/gift/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: gift.claim_token }),
      });
      const data = await res.json();
      if (res.ok) onRefresh();
      else alert(data.error ?? 'Błąd');
    } finally {
      setClaiming(false);
    }
  };

  const productName = gift.entitlements?.products?.name ?? gift.entitlements?.type ?? 'Sesja';

  return (
    <div className="p-4 rounded-xl border border-htg-card-border bg-htg-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-htg-fg truncate">{productName}</p>
          <p className="text-xs text-htg-fg-muted mt-0.5">
            {format(new Date(gift.created_at), 'd MMM yyyy', { locale: pl })}
          </p>
        </div>
        <StatusBadge status={gift.status} />
      </div>

      {gift.message && (
        <p className="text-xs text-htg-fg-muted italic border-l-2 border-htg-warm/30 pl-2">
          {gift.message}
        </p>
      )}

      {gift.status === 'pending' && (
        <div className="pt-1">
          <button
            onClick={claim}
            disabled={claiming}
            className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-htg-warm text-white hover:bg-htg-warm/90 disabled:opacity-50 transition-colors"
          >
            <Gift className="w-3 h-3" />
            {claiming ? 'Odbieranie…' : 'Odbierz na swoje konto'}
          </button>
          <p className="text-xs text-htg-fg-muted mt-1.5">
            Sesja zostanie przeniesiona na Twoje konto i będziesz mógł jej używać samodzielnie.
          </p>
        </div>
      )}

      {gift.status === 'claimed' && gift.claimed_at && (
        <p className="text-xs text-emerald-600">
          Odebrana {format(new Date(gift.claimed_at), 'd MMM yyyy', { locale: pl })} — sesja jest już na Twoim koncie
        </p>
      )}
    </div>
  );
}

export default function GiftManagement({ sentGifts, receivedGifts, baseUrl, locale }: Props) {
  // Simple refresh via reload
  const refresh = () => window.location.reload();

  const pendingSent = sentGifts.filter(g => g.status === 'pending');
  const otherSent = sentGifts.filter(g => g.status !== 'pending');
  const pendingReceived = receivedGifts.filter(g => g.status === 'pending');
  const otherReceived = receivedGifts.filter(g => g.status !== 'pending');

  return (
    <div className="space-y-8">
      {/* Sent gifts */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-htg-fg-muted" />
          <h3 className="text-base font-semibold text-htg-fg">Wysłane prezenty</h3>
        </div>

        {sentGifts.length === 0 ? (
          <p className="text-sm text-htg-fg-muted py-4 text-center">Nie kupiłeś jeszcze żadnych sesji w prezencie.</p>
        ) : (
          <div className="space-y-3">
            {pendingSent.map(g => (
              <SentGiftCard key={g.id} gift={g} baseUrl={baseUrl} onRefresh={refresh} />
            ))}
            {otherSent.length > 0 && (
              <>
                <p className="text-xs text-htg-fg-muted font-medium uppercase tracking-wide pt-2">Historia</p>
                {otherSent.map(g => (
                  <SentGiftCard key={g.id} gift={g} baseUrl={baseUrl} onRefresh={refresh} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-htg-card-border" />

      {/* Received gifts */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-htg-fg-muted" />
          <h3 className="text-base font-semibold text-htg-fg">Otrzymane prezenty</h3>
        </div>

        {receivedGifts.length === 0 ? (
          <p className="text-sm text-htg-fg-muted py-4 text-center">Nie masz żadnych sesji otrzymanych w prezencie.</p>
        ) : (
          <div className="space-y-3">
            {pendingReceived.map(g => (
              <ReceivedGiftCard key={g.id} gift={g} locale={locale} onRefresh={refresh} />
            ))}
            {otherReceived.length > 0 && (
              <>
                <p className="text-xs text-htg-fg-muted font-medium uppercase tracking-wide pt-2">Historia</p>
                {otherReceived.map(g => (
                  <ReceivedGiftCard key={g.id} gift={g} locale={locale} onRefresh={refresh} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
