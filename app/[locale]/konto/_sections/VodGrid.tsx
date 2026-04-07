'use client';

import { useState, useCallback } from 'react';
import { Play, Clock, CheckCircle2, Bookmark } from 'lucide-react';
import type { MonthSection, VodSession } from '@/lib/services/vod-library';
import SessionReviewPlayer from '@/components/session-review/SessionReviewPlayer';

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
 * Dense, content-first layout.
 */
export default function VodGrid({ sections, singleSessions, userId, userEmail, listenedSessionIds, bookmarkedSessionIds }: Props) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlistened' | 'bookmarked'>('all');
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const [listened] = useState<Set<string>>(() => new Set(listenedSessionIds));
  const [bookmarked] = useState<Set<string>>(() => new Set(bookmarkedSessionIds));

  // Flatten all sessions
  const allSessions = [
    ...sections.flatMap(s => s.sessions),
    ...singleSessions,
  ];

  const filtered = allSessions.filter(s => {
    if (statusFilter === 'unlistened') return !listened.has(s.id);
    if (statusFilter === 'bookmarked') return bookmarked.has(s.id);
    return true;
  });

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-base font-semibold text-htg-fg">Nagrania z sesji</h2>

        {/* Filter dropdown */}
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
          {filtered.map((session) => (
            <div key={session.id}>
              <button
                onClick={() => setPlayingSessionId(prev => prev === session.id ? null : session.id)}
                className="w-full bg-htg-card border border-htg-card-border rounded-lg p-3.5 text-left hover:border-htg-warm/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-htg-fg line-clamp-2 flex-1 group-hover:text-htg-warm transition-colors">
                    {session.title}
                  </p>
                  <div className="shrink-0 w-7 h-7 rounded-md bg-htg-warm/10 flex items-center justify-center group-hover:bg-htg-warm/20 transition-colors">
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

              {/* Inline player */}
              {playingSessionId === session.id && session.isPlayable && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <SessionReviewPlayer
                    playbackId={session.id}
                    idFieldName="sessionId"
                    userEmail={userEmail}
                    userId={userId}
                    tokenEndpoint="/api/video/token"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
