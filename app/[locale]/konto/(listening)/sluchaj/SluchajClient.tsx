'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2, Bookmark, CheckCircle2 } from 'lucide-react';
import { Link } from '@/i18n-config';
import type { MonthSection, VodSession } from '@/lib/services/vod-library';
import FontSizeToggle from '@/components/FontSizeToggle';
import ThemeToggle from '@/components/ThemeToggle';
import LocaleSwitcher from '@/components/LocaleSwitcher';

const SessionReviewPlayer = dynamic(
  () => import('@/components/session-review/SessionReviewPlayer'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center aspect-square md:aspect-video bg-htg-card">
        <Loader2 className="w-8 h-8 animate-spin text-htg-fg-muted" />
      </div>
    ),
  },
);

type FilterMode = 'all' | 'unlistened' | 'bookmarked';

type Props = {
  sections: MonthSection[];
  singleSessions: VodSession[];
  userId: string;
  userEmail: string;
  listenedSessionIds: string[];
  bookmarkedSessionIds: string[];
};

export default function SluchajClient({
  sections,
  singleSessions,
  userId,
  userEmail,
  listenedSessionIds,
  bookmarkedSessionIds,
}: Props) {
  const [listenedIds, setListenedIds] = useState<Set<string>>(() => new Set(listenedSessionIds));
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => new Set(bookmarkedSessionIds));

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
  const [filter, setFilter] = useState<FilterMode>('all');
  const [menuOpen, setMenuOpen] = useState(false);

  const groupStats = useMemo(() => {
    const stats: Record<string, { total: number; listened: number; bookmarked: number }> = {};
    for (const g of groups) {
      stats[g.key] = {
        total: g.sessions.length,
        listened: g.sessions.filter((s) => listenedIds.has(s.id)).length,
        bookmarked: g.sessions.filter((s) => bookmarkedIds.has(s.id)).length,
      };
    }
    return stats;
  }, [groups, listenedIds, bookmarkedIds]);

  const toggleListened = useCallback(async (sessionId: string) => {
    const next = !listenedIds.has(sessionId);
    setListenedIds((prev) => {
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
      setListenedIds((prev) => {
        const s = new Set(prev);
        if (next) s.delete(sessionId); else s.add(sessionId);
        return s;
      });
    }
  }, [listenedIds]);

  const toggleBookmark = useCallback(async (sessionId: string) => {
    const next = !bookmarkedIds.has(sessionId);
    setBookmarkedIds((prev) => {
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
      setBookmarkedIds((prev) => {
        const s = new Set(prev);
        if (next) s.delete(sessionId); else s.add(sessionId);
        return s;
      });
    }
  }, [bookmarkedIds]);

  const currentGroup = groups.find((g) => g.key === selectedKey);

  const filteredSessions = useMemo(() => {
    const sessions = currentGroup?.sessions ?? [];
    if (filter === 'unlistened') return sessions.filter((s) => !listenedIds.has(s.id));
    if (filter === 'bookmarked') return sessions.filter((s) => bookmarkedIds.has(s.id));
    return sessions;
  }, [currentGroup, filter, listenedIds, bookmarkedIds]);

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

  const filterLabels: Record<FilterMode, string> = {
    all: 'Wszystkie',
    unlistened: 'Nieodsłuchane',
    bookmarked: 'Wracam',
  };

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

        {/* Menu button — opens dropdown with months + settings */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-1.5 text-sm text-htg-fg hover:bg-htg-surface transition-colors max-w-[220px] truncate"
          >
            {groups.find((g) => g.key === selectedKey)?.label ?? 'Menu'}
            <span className="ml-1.5 text-htg-fg-muted">&#9662;</span>
          </button>

          {menuOpen && (
            <>
              {/* Backdrop — above player */}
              <div className="fixed inset-0 z-[490]" onClick={() => setMenuOpen(false)} />

              {/* Dropdown — above backdrop */}
              <div className="absolute right-0 top-full mt-1 z-[500] w-72 bg-htg-card border border-htg-card-border rounded-xl shadow-lg overflow-hidden">
                {/* Month options — scrollable for up to 28 months */}
                <div className="border-b border-htg-card-border max-h-72 overflow-y-auto">
                  {groups.map((g) => {
                    const stats = groupStats[g.key];
                    return (
                      <button
                        key={g.key}
                        onClick={() => {
                          setSelectedKey(g.key);
                          setPlayingSessionId(null);
                          setMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                          selectedKey === g.key
                            ? 'bg-htg-sage/10 text-htg-sage font-medium'
                            : 'text-htg-fg hover:bg-htg-surface/60'
                        }`}
                      >
                        <span className="truncate">{g.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs flex items-center gap-0.5 ${
                            stats.listened === stats.total && stats.total > 0
                              ? 'text-htg-sage'
                              : 'text-htg-fg-muted'
                          }`}>
                            <CheckCircle2 className="w-3 h-3" />
                            {stats.listened}/{stats.total}
                          </span>
                          {stats.bookmarked > 0 && (
                            <span className="text-xs flex items-center gap-0.5 text-amber-400">
                              <Bookmark className="w-3 h-3 fill-current" />
                              {stats.bookmarked}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Filters */}
                <div className="border-b border-htg-card-border px-4 py-2.5">
                  <p className="text-xs text-htg-fg-muted uppercase tracking-wider mb-1.5">Filtr</p>
                  <div className="flex gap-1.5">
                    {(Object.keys(filterLabels) as FilterMode[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          filter === f
                            ? 'bg-htg-sage text-white border-htg-sage'
                            : 'border-htg-card-border text-htg-fg-muted hover:border-htg-sage/40'
                        }`}
                      >
                        {filterLabels[f]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Settings row: font size + theme */}
                <div className="border-b border-htg-card-border px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <FontSizeToggle />
                    <ThemeToggle />
                  </div>
                </div>

                {/* Locale switcher */}
                <div className="px-4 py-2.5">
                  <LocaleSwitcher />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main content — player on top, session list below, centered */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-4 pb-4">
        <div className="w-full max-w-[640px] mx-auto md:my-auto">
          {/* Player — natural aspect ratio (square mobile, 16:9 desktop) */}
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
              <div className="aspect-square md:aspect-video bg-htg-card flex items-center justify-center">
                <p className="text-htg-fg-muted text-sm">Wybierz sesję</p>
              </div>
            )}
          </div>

          {/* Session list — directly attached below player, full player width */}
          <div className="bg-htg-card border border-t-0 border-htg-card-border rounded-b-xl overflow-hidden">
            {filteredSessions.length === 0 ? (
              <div className="px-4 py-6 text-center text-htg-fg-muted text-sm">
                Brak sesji dla wybranego filtru
              </div>
            ) : (
              filteredSessions.map((session) => {
                const isPlaying = playingSessionId === session.id;
                const isListened = listenedIds.has(session.id);
                const isBookmarked = bookmarkedIds.has(session.id);
                return (
                  <div
                    key={session.id}
                    className={`flex items-center border-b border-htg-card-border last:border-b-0 transition-colors ${
                      isPlaying
                        ? 'bg-htg-sage/10 border-l-2 border-l-htg-sage'
                        : 'hover:bg-htg-surface/60'
                    }`}
                  >
                    {/* Title — clicking plays the session */}
                    <button
                      onClick={() => setPlayingSessionId(session.id)}
                      className="flex-1 text-left px-4 py-3.5 min-w-0"
                    >
                      <span className="font-medium text-htg-fg block pl-3 -indent-3">{session.title}</span>
                    </button>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 px-2 shrink-0">
                      {/* Wróć / bookmark */}
                      <button
                        onClick={() => toggleBookmark(session.id)}
                        aria-pressed={isBookmarked}
                        aria-label="Wróć do tej sesji"
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isBookmarked
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'text-htg-fg-muted hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
                        <span className="hidden sm:inline">Wróć</span>
                      </button>

                      {/* Odsłuchana / listened */}
                      <button
                        onClick={() => toggleListened(session.id)}
                        aria-pressed={isListened}
                        aria-label="Odsłuchana"
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isListened
                            ? 'bg-htg-sage/15 text-htg-sage'
                            : 'text-htg-fg-muted hover:text-htg-sage hover:bg-htg-sage/10'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Odsłuchana</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
