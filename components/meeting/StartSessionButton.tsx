'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n-config';
import { Play, Loader2, CalendarPlus, ChevronDown, ChevronUp } from 'lucide-react';

interface StartSessionButtonProps {
  meetingId: string;
  locale: string;
}

export default function StartSessionButton({ meetingId, locale }: StartSessionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduled, setScheduled] = useState(false);

  const handleStart = async (scheduleOnly = false) => {
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = { meetingId };
      if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();

      const res = await fetch('/api/htg-meeting/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Błąd'); return; }

      if (scheduleOnly) {
        setScheduled(true);
        setShowSchedule(false);
      } else {
        router.push({pathname: '/spotkanie/[sessionId]', params: {sessionId: data.sessionId}} as any);
      }
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  };

  if (scheduled) {
    return (
      <span className="text-sm text-htg-sage font-medium">
        Sesja zaplanowana ✓
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowSchedule(s => !s)}
          title="Zaplanuj na termin"
          className="p-2.5 rounded-xl bg-htg-surface hover:bg-htg-card text-htg-fg-muted transition-colors border border-htg-card-border"
        >
          <CalendarPlus className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleStart(false)}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Uruchom sesję
        </button>
      </div>

      {showSchedule && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-htg-surface border border-htg-card-border">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="text-sm bg-transparent text-htg-fg focus:outline-none"
          />
          <button
            onClick={() => handleStart(true)}
            disabled={!scheduledAt || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-htg-sage/15 text-htg-sage text-xs font-medium
              hover:bg-htg-sage/25 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />}
            Zaplanuj
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
