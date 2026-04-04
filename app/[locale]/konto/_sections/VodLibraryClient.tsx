'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Play, ChevronDown, Clock, CheckCircle2, Bookmark } from 'lucide-react';
import type { MonthSection, VodSession } from '@/lib/services/vod-library';
import SessionReviewPlayer from '@/components/session-review/SessionReviewPlayer';

type Props = {
  sections: MonthSection[];
  singleSessions: VodSession[];
  futureMonthsCount: number;
  userId: string;
  userEmail: string;
  listenedSessionIds: string[];
  bookmarkedSessionIds: string[];
};

export default function VodLibraryClient({ sections, singleSessions, futureMonthsCount, userId, userEmail, listenedSessionIds, bookmarkedSessionIds }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(() => {
    const firstNonEmptySection = sections.find(s => s.sessions.length > 0);
    return firstNonEmptySection ? firstNonEmptySection.monthLabel : (singleSessions.length > 0 ? 'singles' : null);
  });

  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const [listened, setListened] = useState<Set<string>>(() => new Set(listenedSessionIds));
  const [bookmarked, setBookmarked] = useState<Set<string>>(() => new Set(bookmarkedSessionIds));
  const [filter, setFilter] = useState<'all' | 'unlistened' | 'bookmarked'>('all');

  const toggleSection = (key: string) => {
    setExpandedKey(prev => {
      if (prev === key) {
        setPlayingSessionId(null);
        return null;
      }
      setPlayingSessionId(null);
      return key;
    });
  };

  const togglePlay = (sessionId: string) => {
    setPlayingSessionId(prev => prev === sessionId ? null : sessionId);
  };

  const toggleListened = useCallback(async (sessionId: string) => {
    const next = !listened.has(sessionId);
    setListened(prev => {
      const s = new Set(prev);
      if (next) s.add(sessionId); else s.delete(sessionId);
      return s;
    });
    try {
      await fetch('/api/video/session-listened', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, listened: next }),
      });
    } catch {
      // revert on error
      setListened(prev => {
        const s = new Set(prev);
        if (next) s.delete(sessionId); else s.add(sessionId);
        return s;
      });
    }
  }, [listened]);

  const toggleBookmark = useCallback(async (sessionId: string) => {
    const next = !bookmarked.has(sessionId);
    setBookmarked(prev => {
      const s = new Set(prev);
      if (next) s.add(sessionId); else s.delete(sessionId);
      return s;
    });
    try {
      await fetch('/api/video/session-bookmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, bookmarked: next }),
      });
    } catch {
      setBookmarked(prev => {
        const s = new Set(prev);
        if (next) s.delete(sessionId); else s.add(sessionId);
        return s;
      });
    }
  }, [bookmarked]);

  const filterSessions = (sessions: VodSession[]) => {
    if (filter === 'unlistened') return sessions.filter(s => !listened.has(s.id));
    if (filter === 'bookmarked') return sessions.filter(s => bookmarked.has(s.id));
    return sessions;
  };

  const pills: { key: typeof filter; label: string; icon: React.ReactNode }[] = [
    { key: 'unlistened', label: 'Nieodsłuchane', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { key: 'bookmarked', label: 'Wracam',         icon: <Bookmark className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-htg-fg-muted">Pokaż:</span>
        <button
          onClick={() => setFilter('all')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            filter === 'all'
              ? 'bg-htg-sage text-white border-htg-sage'
              : 'border-htg-card-border text-htg-fg-muted hover:border-htg-sage/40 hover:text-htg-fg'
          }`}
        >
          Wszystkie
        </button>
        {pills.map(p => (
          <button
            key={p.key}
            onClick={() => setFilter(prev => prev === p.key ? 'all' : p.key)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === p.key
                ? 'bg-htg-sage text-white border-htg-sage'
                : 'border-htg-card-border text-htg-fg-muted hover:border-htg-sage/40 hover:text-htg-fg'
            }`}
          >
            {p.icon}{p.label}
          </button>
        ))}
      </div>

      {sections.map((section) => {
        const visible = filterSessions(section.sessions);
        if (filter !== 'all' && visible.length === 0 && section.sessions.length > 0) return null;
        return (
          <AccordionMonth
            key={section.monthLabel}
            title={section.title}
            sessionsCount={section.sessions.length}
            listenedCount={section.sessions.filter(s => listened.has(s.id)).length}
            bookmarkedCount={section.sessions.filter(s => bookmarked.has(s.id)).length}
            isExpanded={expandedKey === section.monthLabel}
            onToggle={() => toggleSection(section.monthLabel)}
          >
            {section.sessions.length === 0 ? (
              <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center text-htg-fg-muted">
                Sesje w przygotowaniu
              </div>
            ) : (
              <div className="space-y-4">
                {visible.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isPlaying={playingSessionId === session.id}
                    onTogglePlay={() => togglePlay(session.id)}
                    isListened={listened.has(session.id)}
                    onToggleListened={() => toggleListened(session.id)}
                    isBookmarked={bookmarked.has(session.id)}
                    onToggleBookmark={() => toggleBookmark(session.id)}
                    userId={userId}
                    userEmail={userEmail}
                  />
                ))}
              </div>
            )}
          </AccordionMonth>
        );
      })}

      {singleSessions.length > 0 && (filter === 'all' || filterSessions(singleSessions).length > 0) && (
        <AccordionMonth
          title="Sesje pojedyncze"
          sessionsCount={singleSessions.length}
          listenedCount={singleSessions.filter(s => listened.has(s.id)).length}
          bookmarkedCount={singleSessions.filter(s => bookmarked.has(s.id)).length}
          isExpanded={expandedKey === 'singles'}
          onToggle={() => toggleSection('singles')}
        >
          <div className="space-y-4">
            {filterSessions(singleSessions).map(session => (
              <SessionCard
                key={session.id}
                session={session}
                isPlaying={playingSessionId === session.id}
                onTogglePlay={() => togglePlay(session.id)}
                isListened={listened.has(session.id)}
                onToggleListened={() => toggleListened(session.id)}
                isBookmarked={bookmarked.has(session.id)}
                onToggleBookmark={() => toggleBookmark(session.id)}
                userId={userId}
                userEmail={userEmail}
              />
            ))}
          </div>
        </AccordionMonth>
      )}

      {futureMonthsCount > 0 && (
        <div className="bg-htg-sage/10 text-htg-sage border border-htg-sage/20 rounded-xl p-4 text-center text-sm font-medium">
          Masz dostęp do {futureMonthsCount} przyszłych miesięcy (pojawią się tutaj, gdy zostaną opublikowane).
        </div>
      )}
    </div>
  );
}

function AccordionMonth({
  title,
  sessionsCount,
  listenedCount,
  bookmarkedCount,
  isExpanded,
  onToggle,
  children
}: {
  title: string;
  sessionsCount: number;
  listenedCount: number;
  bookmarkedCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-htg-surface/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium text-htg-fg">{title}</h3>
          <span className="text-sm text-htg-fg-muted font-normal bg-htg-surface px-2 py-0.5 rounded-full">
            {sessionsCount}
          </span>
          {listenedCount > 0 && (
            <span className="text-xs text-htg-sage font-normal flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {listenedCount}/{sessionsCount}
            </span>
          )}
          {bookmarkedCount > 0 && (
            <span className="text-xs text-amber-400 font-normal flex items-center gap-1">
              <Bookmark className="w-3.5 h-3.5 fill-current" />
              {bookmarkedCount}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-htg-fg-muted transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-4 pt-0 border-t border-htg-card-border">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function splitSentences(text: string): string[] {
  if (typeof Intl.Segmenter === 'undefined') {
    return [text];
  }
  const segmenter = new Intl.Segmenter('pl', { granularity: 'sentence' });
  const segments = [...segmenter.segment(text)].map(s => s.segment.trim()).filter(Boolean);
  return segments.length > 0 ? segments : [text];
}

function SessionCard({
  session,
  isPlaying,
  onTogglePlay,
  isListened,
  onToggleListened,
  isBookmarked,
  onToggleBookmark,
  userId,
  userEmail
}: {
  session: VodSession;
  isPlaying: boolean;
  onTogglePlay: () => void;
  isListened: boolean;
  onToggleListened: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  userId: string;
  userEmail: string;
}) {
  const [expandedDesc, setExpandedDesc] = useState(false);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const sentences = useMemo(
    () => (session.description ? splitSentences(session.description) : []),
    [session.description],
  );

  useEffect(() => {
    if (isPlaying && playerRef.current) {
      setTimeout(() => {
        playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [isPlaying]);

  // Auto-rotate sentences; pause on hover or when expanded
  useEffect(() => {
    if (sentences.length < 2 || expandedDesc || paused) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    const id = setInterval(() => {
      setSentenceIndex(prev => (prev + 1) % sentences.length);
    }, 3500);
    return () => clearInterval(id);
  }, [sentences.length, expandedDesc, paused]);

  const canExpand = sentences.length > 1 && (session.description?.length ?? 0) > 100;

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      isListened
        ? 'border-htg-sage/30 bg-htg-sage/5'
        : 'border-htg-card-border bg-htg-surface/30'
    }`}>
      <div className="p-4 flex flex-col md:flex-row md:items-start gap-4">
        <div className="w-10 h-10 bg-htg-surface rounded-lg flex items-center justify-center shrink-0">
          <Play className="w-5 h-5 text-htg-sage" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h4 className="font-semibold text-htg-fg">{session.title}</h4>
              {session.durationMinutes && (
                <div className="flex items-center gap-1.5 text-sm text-htg-fg-muted mt-1">
                  <Clock className="w-4 h-4" />
                  <span>{session.durationMinutes} min</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onToggleBookmark}
                title={isBookmarked ? 'Usuń zakładkę' : 'Wróć do tej sesji'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isBookmarked
                    ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                    : 'bg-htg-surface text-htg-fg-muted hover:text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                {isBookmarked ? 'Wróć' : 'Wróć'}
              </button>
              <button
                onClick={onToggleListened}
                title={isListened ? 'Oznacz jako nieodsłuchaną' : 'Oznacz jako odsłuchaną'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isListened
                    ? 'bg-htg-sage/15 text-htg-sage hover:bg-htg-sage/25'
                    : 'bg-htg-surface text-htg-fg-muted hover:text-htg-sage hover:bg-htg-sage/10'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {isListened ? 'Odsłuchana' : 'Odsłuchana?'}
              </button>
              {session.isPlayable && (
                <button
                  onClick={onTogglePlay}
                  className="flex items-center gap-2 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {isPlaying ? 'Zamknij' : 'Odsłuchaj'}
                </button>
              )}
            </div>
          </div>

          {session.description && (
            <div
              className="mt-2 text-sm text-htg-fg-muted"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              {expandedDesc ? (
                <p>{session.description}</p>
              ) : (
                <p
                  key={sentenceIndex}
                  className={`line-clamp-2 ${sentences.length > 1 ? 'animate-[fadeIn_500ms_ease-in-out]' : ''}`}
                >
                  {sentences[sentenceIndex]}
                </p>
              )}
              {canExpand && (
                <button
                  onClick={() => setExpandedDesc(!expandedDesc)}
                  className="text-htg-sage hover:underline mt-1 font-medium"
                >
                  {expandedDesc ? 'Zwiń' : 'Rozwiń'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isPlaying && (
        <div ref={playerRef} className="border-t border-htg-card-border bg-black">
          <SessionReviewPlayer
            playbackId={session.id}
            idFieldName="sessionId"
            userId={userId}
            userEmail={userEmail}
            tokenEndpoint="/api/video/token"
          />
        </div>
      )}
    </div>
  );
}
