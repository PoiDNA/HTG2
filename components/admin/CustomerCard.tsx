'use client';

import {
  User, Shield, ShieldAlert, CalendarDays, CreditCard, Package,
  MessageSquare, ExternalLink, Search, Send, AlertTriangle,
} from 'lucide-react';
import type { CustomerCard as CardType } from '@/lib/email/types';

interface Props {
  card: CardType | null;
  isVerified: boolean;
  conversationId: string;
  onLinkUser?: () => void;
  onSendVerification?: () => void;
}

export default function CustomerCard({ card, isVerified, conversationId, onLinkUser, onSendVerification }: Props) {
  if (!card) {
    return (
      <div className="p-4 text-center text-htg-fg-muted text-sm">
        Ładowanie profilu...
      </div>
    );
  }

  // Guest (no HTG account)
  if (card.isGuest) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-htg-fg-muted">
          <User className="w-5 h-5" />
          <span className="text-sm font-medium">Nierozpoznany gość</span>
        </div>
        <p className="text-xs text-htg-fg-muted">{card.email}</p>
        <p className="text-xs text-htg-fg-muted">Brak konta HTG dla tego adresu email.</p>
        <button
          onClick={onLinkUser}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-htg-surface border border-htg-card-border text-htg-fg hover:bg-htg-card transition-colors"
        >
          <Search className="w-3 h-3" />
          Połącz z profilem klienta
        </button>
      </div>
    );
  }

  // Unverified (linked but not confirmed)
  if (!isVerified) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-htg-fg">{card.displayName || card.email}</p>
            <p className="text-xs text-amber-500 font-medium">Niezweryfikowane powiązanie</p>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Dane klienta (sesje, zakupy) ukryte do weryfikacji. Kliknij poniżej aby wysłać link potwierdzający.
            </p>
          </div>
        </div>
        <button
          onClick={onSendVerification}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-htg-warm/10 border border-htg-warm/20 text-htg-warm hover:bg-htg-warm/20 transition-colors"
        >
          <Send className="w-3 h-3" />
          Wyślij weryfikację
        </button>
      </div>
    );
  }

  // Verified — full card
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-emerald-500" />
        <div>
          <p className="text-sm font-medium text-htg-fg">{card.displayName || card.email}</p>
          <p className="text-xs text-emerald-600">Zweryfikowany</p>
        </div>
      </div>

      <div className="text-xs text-htg-fg-muted space-y-1">
        <p>{card.email}</p>
        <p>Konto od: {card.createdAt ? new Date(card.createdAt).toLocaleDateString('pl-PL') : '—'}</p>
        <p>Rola: {card.role || 'użytkownik'}</p>
      </div>

      {/* Subscription */}
      {card.hasActiveSubscription !== undefined && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
          card.hasActiveSubscription
            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
            : 'bg-htg-surface text-htg-fg-muted border border-htg-card-border'
        }`}>
          <Package className="w-3 h-3" />
          Subskrypcja: {card.hasActiveSubscription ? 'AKTYWNA' : 'Brak'}
        </div>
      )}

      {/* Upcoming bookings */}
      {card.upcomingBookings && card.upcomingBookings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-htg-fg-muted mb-1.5 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" /> Nadchodzące sesje
          </p>
          <div className="space-y-1">
            {card.upcomingBookings.slice(0, 3).map((b, i) => (
              <div key={i} className="text-xs text-htg-fg bg-htg-surface rounded px-2 py-1">
                {b.slot_date} {b.start_time?.slice(0, 5)} · {b.session_type}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      {card.recentOrders && card.recentOrders.length > 0 && (
        <div>
          <p className="text-xs font-medium text-htg-fg-muted mb-1.5 flex items-center gap-1">
            <CreditCard className="w-3 h-3" /> Ostatnie zamówienia
          </p>
          <div className="space-y-1">
            {card.recentOrders.slice(0, 3).map((o, i) => (
              <div key={i} className="text-xs text-htg-fg bg-htg-surface rounded px-2 py-1 flex justify-between">
                <span>{(o.amount / 100).toFixed(0)} PLN</span>
                <span className="text-htg-fg-muted">{o.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previous threads */}
      {card.recentThreads && card.recentThreads.length > 0 && (
        <div>
          <p className="text-xs font-medium text-htg-fg-muted mb-1.5 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Poprzednie wątki
          </p>
          <div className="space-y-1">
            {card.recentThreads.slice(0, 3).map((t, i) => (
              <div key={i} className="text-xs text-htg-fg-muted truncate">
                {t.subject || '(bez tematu)'} — <span className="text-htg-fg">{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {card.totalBookings !== undefined && (
        <p className="text-xs text-htg-fg-muted">Łącznie rezerwacji: {card.totalBookings}</p>
      )}

      <a
        href={`/pl/konto/admin/uzytkownicy?id=${card.userId}`}
        className="flex items-center gap-1 text-xs text-htg-sage hover:underline"
      >
        <ExternalLink className="w-3 h-3" />
        Otwórz profil →
      </a>
    </div>
  );
}
