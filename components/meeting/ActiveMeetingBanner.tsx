'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n-config';
import { Users2, ChevronRight, Loader2 } from 'lucide-react';

interface ActiveSession {
  sessionId: string;
  sessionStatus: string;
  meetingName: string;
  isModerator: boolean;
}

export default function ActiveMeetingBanner({ locale }: { locale: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/htg-meeting/session/my-active');
        const data = await res.json();
        if (!cancelled) setSessions(data.sessions ?? []);
      } catch {}
    };

    check();
    const iv = setInterval(check, 10_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (sessions.length === 0) return null;

  const handleJoin = (sessionId: string) => {
    setJoining(sessionId);
    router.push({pathname: '/spotkanie/[sessionId]', params: {sessionId}} as any);
  };

  return (
    <div className="space-y-2 mb-6">
      {sessions.map((s) => {
        const isActive = s.sessionStatus === 'active' || s.sessionStatus === 'free_talk';
        return (
          <div
            key={s.sessionId}
            className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border
              ${isActive
                ? 'bg-htg-sage/10 border-htg-sage/30'
                : 'bg-htg-surface border-htg-card-border'
              }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0
                ${isActive ? 'bg-htg-sage animate-pulse' : 'bg-htg-fg-muted/40'}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-htg-fg truncate">{s.meetingName}</p>
                <p className="text-xs text-htg-fg-muted">
                  {isActive ? 'Sesja w trakcie' : 'Oczekuje na start'}
                </p>
              </div>
            </div>

            {isActive && (
              <button
                onClick={() => handleJoin(s.sessionId)}
                disabled={joining === s.sessionId}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium
                  hover:bg-htg-sage/80 transition-colors shrink-0 disabled:opacity-60"
              >
                {joining === s.sessionId
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <>Dołącz <ChevronRight className="w-4 h-4" /></>
                }
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
