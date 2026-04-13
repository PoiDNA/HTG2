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
      <div className="flex items-center justify-center h-full">
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
  // Build playable groups for dropdown
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

  // Empty state
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
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-htg-card-border">
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
          className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-1.5 text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-sage/50 max-w-[200px] truncate"
        >
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      {/* Player */}
      {playingSessionId && (
        <div className="shrink-0 max-h-[45vh]">
          <SessionReviewPlayer
            key={playingSessionId}
            playbackId={playingSessionId}
            idFieldName="sessionId"
            userId={userId}
            userEmail={userEmail}
            tokenEndpoint="/api/video/token"
          />
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="space-y-1">
          {currentGroup?.sessions.map((session, index) => (
            <button
              key={session.id}
              onClick={() => setPlayingSessionId(session.id)}
              className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                playingSessionId === session.id
                  ? 'bg-htg-sage/10 border-l-2 border-htg-sage pl-2.5'
                  : 'hover:bg-htg-surface/60'
              }`}
            >
              <span className="text-htg-fg-muted mr-2 tabular-nums text-sm">{index + 1}.</span>
              <span className="font-medium text-htg-fg">{session.title}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
