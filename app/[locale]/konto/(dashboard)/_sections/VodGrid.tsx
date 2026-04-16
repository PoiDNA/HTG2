'use client';

import { useState } from 'react';
import { Play, Clock, CheckCircle2, Bookmark } from 'lucide-react';
import type { MonthSection, VodSession } from '@/lib/services/vod-library';
import { usePlayer } from '@/lib/player-context';

type Props = {
  sections: MonthSection[];
  singleSessions: VodSession[];
  userId: string;
  userEmail: string;
  listenedSessionIds: string[];
  bookmarkedSessionIds: string[];
};

/**
 * V3 "Sanctum" VOD — 3-column grid with dropdown filters.
 * Dispatches playback to global PlayerContext (StickyPlayer).
 */
export default function VodGrid({ sections, singleSessions, listenedSessionIds, bookmarkedSessionIds }: Props) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlistened' | 'bookmarked'>('all');
  const [listened] = useState<Set<string>>(() => new Set(listenedSessionIds));
  const [bookmarked] = useState<Set<string>>(() => new Set(bookmarkedSessionIds));
  const { startSessionPlayback: startPlayback, activeSession } = usePlayer();

  const allSessions = [
    ...sections.flatMap(s => s.sessions),
    ...singleSessions,
  ];

  const filtered = allSessions.filter(s => {
    if (statusFilter === 'unlistened') return !listened.has(s.id);
    if (statusFilter === 'bookmarked') return bookmarked.has(s.id);
    return true;
  });

  const handlePlay = (session: VodSession) => {
    if (!session.isPlayable) return;
    startPlayback({
      playbackId: session.id,
      idFieldName: 'sessionId',
      tokenEndpoint: '/api/video/token',
      title: session.title,
    });
  };

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-base font-semibold text-htg-fg">Nagrania z sesji</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="text-xs bg-htg-surface border border-htg-card-border rounded-lg px-3 py-1.5 text-htg-fg-muted focus:outline-none focus:ring-1 focus:ring-htg-warm/50"
        >
          <option value="all">Wszystkie</option>
          <option value="unlistened">Niedosłuchane</option>
          <option value="bookmarked">Zakładki</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-htg-fg-muted py-4">Brak sesji.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((session) => {
            const isActive = activeSession?.playbackId === session.id;
            return (
              <button
                key={session.id}
                onClick={() => handlePlay(session)}
                className={`w-full bg-htg-card border rounded-lg p-3.5 text-left transition-colors group ${
                  isActive
                    ? 'border-htg-warm/50 bg-htg-warm/5'
                    : 'border-htg-card-border hover:border-htg-warm/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-medium line-clamp-2 flex-1 transition-colors ${
                    isActive ? 'text-htg-warm' : 'text-htg-fg group-hover:text-htg-warm'
                  }`}>
                    {session.title}
                  </p>
                  <div className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                    isActive ? 'bg-htg-warm/20' : 'bg-htg-warm/10 group-hover:bg-htg-warm/20'
                  }`}>
                    <Play className="w-3 h-3 text-htg-warm" />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-htg-fg-muted">
                  {session.durationMinutes && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {session.durationMinutes} min
                    </span>
                  )}
                  {listened.has(session.id) && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-htg-sage" />
                  )}
                  {bookmarked.has(session.id) && (
                    <Bookmark className="w-3.5 h-3.5 text-htg-warm fill-htg-warm" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
