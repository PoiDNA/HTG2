'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Play, Clock, CheckCircle2, Bookmark, RotateCcw } from 'lucide-react';
import type { MonthSection, VodSession } from '@/lib/services/vod-library';
import ImmersivePlayer from '@/components/variants/v2/ImmersivePlayer';

type FilterTag = 'all' | 'continue' | 'months' | 'bookmarked';

const FILTER_TAGS: { key: FilterTag; label: string }[] = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'continue', label: 'Kontynuuj' },
  { key: 'months', label: 'Miesiące' },
  { key: 'bookmarked', label: 'Wróć' },
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
 * V2 "Sanctuary" VOD — horizontal carousel.
 * Filters: Wszystkie, Kontynuuj (unfinished), Miesiące (by month), Wróć (bookmarked).
 * Hover: 20% scale + month label. Click: player opens 3x in place, others dim.
 */
export default function VodCarousel({ sections, singleSessions, userId, userEmail, listenedSessionIds, bookmarkedSessionIds }: Props) {
  const [filter, setFilter] = useState<FilterTag>('all');
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const [listened] = useState<Set<string>>(() => new Set(listenedSessionIds));
  const [bookmarked] = useState<Set<string>>(() => new Set(bookmarkedSessionIds));
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Build session → month title map
  const sessionMonthMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) {
      for (const s of section.sessions) {
        map.set(s.id, section.title);
      }
    }
    return map;
  }, [sections]);

  // All sessions flat
  const allSessions = useMemo(() => [
    ...sections.flatMap(s => s.sessions),
    ...singleSessions,
  ], [sections, singleSessions]);

  // Available months for "Miesiące" sub-filter
  const availableMonths = useMemo(() =>
    sections.map(s => ({ label: s.title, monthLabel: s.monthLabel })),
  [sections]);

  // Apply filter
  const filtered = useMemo(() => {
    if (filter === 'continue') return allSessions.filter(s => !listened.has(s.id));
    if (filter === 'bookmarked') return allSessions.filter(s => bookmarked.has(s.id));
    if (filter === 'months') {
      if (!selectedMonth) return allSessions;
      const section = sections.find(s => s.monthLabel === selectedMonth);
      return section?.sessions ?? [];
    }
    return allSessions;
  }, [filter, allSessions, listened, bookmarked, sections, selectedMonth]);

  // Auto-select first month when switching to "Miesiące"
  useEffect(() => {
    if (filter === 'months' && !selectedMonth && availableMonths.length > 0) {
      setSelectedMonth(availableMonths[0].monthLabel);
    }
  }, [filter, selectedMonth, availableMonths]);

  // Scroll player into view when opened
  useEffect(() => {
    if (playingSessionId && playerContainerRef.current) {
      setTimeout(() => {
        playerContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [playingSessionId]);

  const handlePlay = (sessionId: string) => {
    setPlayingSessionId(prev => prev === sessionId ? null : sessionId);
  };

  const isPlayerOpen = playingSessionId !== null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-serif font-semibold text-htg-fg">Biblioteka</h2>
      </div>

      {/* Filter tags */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {FILTER_TAGS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setPlayingSessionId(null); if (key !== 'months') setSelectedMonth(null); }}
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

      {/* Month sub-filter pills (only when "Miesiące" active) */}
      {filter === 'months' && availableMonths.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {availableMonths.map(({ label, monthLabel }) => (
            <button
              key={monthLabel}
              onClick={() => { setSelectedMonth(monthLabel); setPlayingSessionId(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedMonth === monthLabel
                  ? 'bg-htg-fg text-htg-bg'
                  : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Horizontal carousel */}
      {filtered.length === 0 ? (
        <p className="text-sm text-htg-fg-muted py-6">Brak sesji w tej kategorii.</p>
      ) : (
        <>
          <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory -mx-2 px-2">
            {filtered.map((session) => {
              const isPlaying = playingSessionId === session.id;
              const monthTitle = sessionMonthMap.get(session.id);

              return (
                <div
                  key={session.id}
                  className={`snap-start shrink-0 transition-all duration-300 ${
                    isPlayerOpen && !isPlaying
                      ? 'opacity-30 pointer-events-none scale-95'
                      : 'opacity-100'
                  }`}
                  style={{ width: isPlaying ? '100%' : '14rem' }}
                >
                  {!isPlaying && (
                    <button
                      onClick={() => handlePlay(session.id)}
                      className="w-full bg-htg-card border border-htg-card-border rounded-xl p-4 text-left
                                 hover:border-htg-indigo/30 hover:scale-[1.20] hover:shadow-lg
                                 transition-all duration-300 origin-center group relative"
                    >
                      {/* Month label on hover */}
                      {monthTitle && (
                        <div className="absolute -top-8 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                          <span className="text-[10px] font-medium text-htg-fg-muted bg-htg-card/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-htg-card-border">
                            Sesje {monthTitle}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-3">
                        <div className="w-8 h-8 rounded-full bg-htg-indigo/10 flex items-center justify-center group-hover:bg-htg-indigo/20 transition-colors">
                          <Play className="w-3.5 h-3.5 text-htg-indigo" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!listened.has(session.id) && filter === 'continue' && (
                            <RotateCcw className="w-3.5 h-3.5 text-htg-indigo/50" />
                          )}
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
                  )}

                  {/* Expanded player — 3x size, in-place */}
                  {isPlaying && session.isPlayable && (
                    <div ref={playerContainerRef} className="w-full animate-in fade-in zoom-in-95 duration-300">
                      <ImmersivePlayer
                        playbackId={session.id}
                        idFieldName="sessionId"
                        userEmail={userEmail}
                        userId={userId}
                        tokenEndpoint="/api/video/token"
                        onEnd={() => setPlayingSessionId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
