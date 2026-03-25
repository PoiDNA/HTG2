'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n-config';
import { User, Users, Calendar, MessageSquare, Check } from 'lucide-react';

interface SessionOption {
  slug: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  priceId: string;
  sessionType: string;
}

interface SessionPickerProps {
  sessions: SessionOption[];
  labels: {
    choose: string;
    date_label: string;
    date_hint: string;
    topics_label: string;
    topics_placeholder: string;
    buy: string;
    cancel_policy: string;
    per_session: string;
  };
}

const SESSION_ICONS: Record<string, typeof User> = {
  natalia_solo: User,
  natalia_agata: Users,
  natalia_justyna: Users,
};

const SESSION_PEOPLE: Record<string, string[]> = {
  natalia_solo: ['Natalia HTG'],
  natalia_agata: ['Natalia HTG', 'Agata HTG (asysta)'],
  natalia_justyna: ['Natalia HTG', 'Justyna HTG (asysta)'],
};

export function SessionPicker({ sessions, labels }: SessionPickerProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [preferredDate, setPreferredDate] = useState('');
  const [topics, setTopics] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const selectedSession = sessions.find((s) => s.slug === selected);

  async function handleCheckout() {
    if (!selectedSession) return;
    setLoading(true);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: selectedSession.priceId,
          mode: 'payment',
          metadata: {
            session_type: selectedSession.sessionType,
            preferred_date: preferredDate,
            topics: topics.slice(0, 500),
          },
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        router.push('/login' as any);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Min date: tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Step 1: Choose session type */}
      <h2 className="font-serif font-semibold text-xl text-htg-fg">{labels.choose}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sessions.map((session) => {
          const Icon = SESSION_ICONS[session.sessionType] || User;
          const people = SESSION_PEOPLE[session.sessionType] || [];
          const isSelected = selected === session.slug;
          const price = (session.amount / 100).toLocaleString('pl-PL');

          return (
            <button
              key={session.slug}
              onClick={() => setSelected(session.slug)}
              className={`relative text-left p-6 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-htg-sage bg-htg-sage/5 ring-2 ring-htg-sage/20'
                  : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
              }`}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-htg-sage rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}

              <Icon className={`w-8 h-8 mb-3 ${isSelected ? 'text-htg-sage' : 'text-htg-fg-muted'}`} />

              <h3 className="font-serif font-semibold text-htg-fg mb-1">{session.name}</h3>

              <div className="space-y-1 mb-4">
                {people.map((p) => (
                  <p key={p} className="text-xs text-htg-fg-muted">{p}</p>
                ))}
              </div>

              <p className="text-2xl font-bold text-htg-fg">
                {price} <span className="text-sm font-normal text-htg-fg-muted">PLN</span>
              </p>
              <p className="text-xs text-htg-fg-muted">{labels.per_session}</p>
            </button>
          );
        })}
      </div>

      {/* Step 2: Date + Topics (shown when session selected) */}
      {selected && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Preferred date */}
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium text-htg-fg mb-1">
              <Calendar className="w-4 h-4 text-htg-sage" />
              {labels.date_label}
            </span>
            <input
              type="date"
              min={minDate}
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-base"
            />
            <p className="text-xs text-htg-fg-muted mt-1">{labels.date_hint}</p>
          </label>

          {/* Topics */}
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium text-htg-fg mb-1">
              <MessageSquare className="w-4 h-4 text-htg-sage" />
              {labels.topics_label}
            </span>
            <textarea
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-base resize-none"
              placeholder={labels.topics_placeholder}
            />
          </label>

          {/* Buy button */}
          <div>
            <button
              onClick={handleCheckout}
              disabled={loading}
              className={`w-full bg-htg-sage text-white py-4 rounded-lg font-semibold text-lg hover:opacity-90 transition-opacity ${
                loading ? 'opacity-50 cursor-wait' : ''
              }`}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Przetwarzanie...
                </span>
              ) : (
                <>
                  {labels.buy} — {((selectedSession?.amount || 0) / 100).toLocaleString('pl-PL')} PLN
                </>
              )}
            </button>

            <p className="text-xs text-htg-fg-muted text-center mt-3">
              {labels.cancel_policy}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
