'use client';

import { useState, useCallback } from 'react';
import { Play, Clock, CheckCircle2, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MonthSection, VodSession } from '@/lib/services/vod-library';
import SessionReviewPlayer from '@/components/session-review/SessionReviewPlayer';

type FilterTag = 'all' | 'unlistened' | 'bookmarked' | 'new';

const FILTER_TAGS: { key: FilterTag; label: string }[] = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'unlistened', label: 'Odpocznij' },
  { key: 'new', label: 'Nowe' },
  { key: 'bookmarked', label: 'Zakładki' },
];

type Props = {
  sections: MonthSection[];
  singleSessions: VodSession[];
  userId: string;
  userEmail: string;
  listenedSessionIds: string[];
  bookmarkedSessionIds: string[];
};

/**
 * V2 "Sanctuary" VOD — horizontal carousel with situational filter tags.
 * Flat scroll, no accordions.
 */
export default function VodCarousel({ sections, singleSessions, userId, userEmail, listenedSessionIds, bookmarkedSessionIds }: Props) {
  const [filter, setFilter] = useState<FilterTag>('all');
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const [listened] = useState<Set<string>>(() => new Set(listenedSessionIds));
  const [bookmarked] = useState<Set<string>>(() => new Set(bookmarkedSessionIds));

  // Flatten all sessions
  const allSessions = [
    ...sections.flatMap(s => s.sessions),
    ...singleSessions,
  ];

  // Apply filter
  const filtered = allSessions.filter(s => {
    if (filter === 'unlistened') return !listened.has(s.id);
    if (filter === 'bookmarked') return bookmarked.has(s.id);
    if (filter === 'new') {
      // "New" = first section (latest month)
      const firstSection = sections[0];
      return firstSection?.sessions.some(fs => fs.id === s.id);
    }
    return true;
  });

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-serif font-semibold text-htg-fg">Biblioteka audio</h2>
      </div>

      {/* Filter tags */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {FILTER_TAGS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === key
                ? 'bg-htg-indigo text-white'
                : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Horizontal carousel */}
      {filtered.length === 0 ? (
        <p className="text-sm text-htg-fg-muted py-6">Brak sesji w tej kategorii.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory -mx-2 px-2">
          {filtered.map((session) => (
            <div
              key={session.id}
              className="snap-start shrink-0 w-56"
            >
              <button
                onClick={() => setPlayingSessionId(prev => prev === session.id ? null : session.id)}
                className="w-full bg-htg-card border border-htg-card-border rounded-xl p-4 text-left hover:border-htg-indigo/30 transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-full bg-htg-indigo/10 flex items-center justify-center group-hover:bg-htg-indigo/20 transition-colors">
                    <Play className="w-3.5 h-3.5 text-htg-indigo" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {listened.has(session.id) && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-htg-sage" />
                    )}
                    {bookmarked.has(session.id) && (
                      <Bookmark className="w-3.5 h-3.5 text-htg-warm fill-htg-warm" />
                    )}
                  </div>
                </div>
                <p className="text-sm font-medium text-htg-fg line-clamp-2 mb-2">
                  {session.title}
                </p>
                {session.durationMinutes && (
                  <p className="flex items-center gap-1 text-xs text-htg-fg-muted">
                    <Clock className="w-3 h-3" />
                    {session.durationMinutes} min
                  </p>
                )}
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
