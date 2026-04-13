'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from '@/i18n-config';
import type { MonthSection, VodSession } from '@/lib/services/vod-library';

const SessionReviewPlayer = dynamic(
  () => import('@/components/session-review/SessionReviewPlayer'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center aspect-square md:aspect-video bg-htg-card rounded-xl">
        <Loader2 className="w-8 h-8 animate-spin text-htg-fg-muted" />
      </div>
    ),
  },
);

type Props = {
  sections: MonthSection[];
  singleSessions: VodSession[];
  userId: string;
  userEmail: string;
};

export default function SluchajClient({ sections, singleSessions, userId, userEmail }: Props) {
  const groups = useMemo(() => {
    const result: { key: string; label: string; sessions: VodSession[] }[] = [];

    for (const section of sections) {
      const playable = section.sessions.filter((s) => s.isPlayable);
      if (playable.length > 0) {
        result.push({ key: section.monthLabel, label: section.title, sessions: playable });
      }
    }

    const playableSingles = singleSessions.filter((s) => s.isPlayable);
    if (playableSingles.length > 0) {
      result.push({ key: '__singles', label: 'Sesje pojedyncze', sessions: playableSingles });
    }

    return result;
  }, [sections, singleSessions]);

  const [selectedKey, setSelectedKey] = useState<string>(groups[0]?.key ?? '');
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);

  const currentGroup = groups.find((g) => g.key === selectedKey);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <p className="text-htg-fg-muted mb-4">Nie masz jeszcze sesji do odsłuchania.</p>
        <Link
          href="/konto"
          className="inline-flex items-center gap-2 text-htg-sage hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć do konta
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <Link
          href="/konto"
          className="inline-flex items-center gap-2 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć
        </Link>

        <select
          value={selectedKey}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            setPlayingSessionId(null);
          }}
          className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-1.5 text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-sage/50 max-w-[220px] truncate"
        >
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main content — single block: player + session list */}
      <div className="flex-1 min-h-0 flex flex-col md:justify-center overflow-y-auto px-4 pb-4">
        <div className="w-full max-w-[430px] mx-auto">
          {/* Player — full width of block */}
          <div className="rounded-t-xl overflow-hidden">
            {playingSessionId ? (
              <SessionReviewPlayer
                key={playingSessionId}
                playbackId={playingSessionId}
                idFieldName="sessionId"
                userId={userId}
                userEmail={userEmail}
                tokenEndpoint="/api/video/token"
              />
            ) : (
              <div className="aspect-square md:aspect-video bg-htg-card flex items-center justify-center rounded-t-xl">
                <p className="text-htg-fg-muted text-sm">Wybierz sesję</p>
              </div>
            )}
          </div>

          {/* Session list — directly attached below player */}
          <div className="bg-htg-card border border-t-0 border-htg-card-border rounded-b-xl overflow-hidden">
            {currentGroup?.sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setPlayingSessionId(session.id)}
                className={`w-full text-left px-4 py-3.5 transition-colors border-b border-htg-card-border last:border-b-0 ${
                  playingSessionId === session.id
                    ? 'bg-htg-sage/10 border-l-2 border-l-htg-sage'
                    : 'hover:bg-htg-surface/60'
                }`}
              >
                <span className="font-medium text-htg-fg">{session.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
