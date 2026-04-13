'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
      <div className="flex items-center justify-center aspect-video bg-htg-card">
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
  const listenedSet = useMemo(() => new Set(listenedSessionIds), [listenedSessionIds]);
  const bookmarkedSet = useMemo(() => new Set(bookmarkedSessionIds), [bookmarkedSessionIds]);

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

  const currentGroup = groups.find((g) => g.key === selectedKey);

  const filteredSessions = useMemo(() => {
    const sessions = currentGroup?.sessions ?? [];
    if (filter === 'unlistened') return sessions.filter((s) => !listenedSet.has(s.id));
    if (filter === 'bookmarked') return sessions.filter((s) => bookmarkedSet.has(s.id));
    return sessions;
  }, [currentGroup, filter, listenedSet, bookmarkedSet]);

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
              {/* Backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />

              {/* Dropdown */}
              <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-htg-card border border-htg-card-border rounded-xl shadow-lg overflow-hidden">
                {/* Month options */}
                <div className="border-b border-htg-card-border">
                  {groups.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => {
                        setSelectedKey(g.key);
                        setPlayingSessionId(null);
                        setMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        selectedKey === g.key
                          ? 'bg-htg-sage/10 text-htg-sage font-medium'
                          : 'text-htg-fg hover:bg-htg-surface/60'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
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

      {/* Main content — single block: player + session list */}
      <div className="flex-1 min-h-0 flex flex-col md:justify-center overflow-y-auto px-4 pb-4">
        <div className="w-full max-w-[430px] mx-auto">
          {/* Player — full width, aspect-video so it's fully visible */}
          <div className="rounded-t-xl overflow-hidden bg-htg-bg">
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
              <div className="aspect-video bg-htg-card flex items-center justify-center rounded-t-xl">
                <p className="text-htg-fg-muted text-sm">Wybierz sesję</p>
              </div>
            )}
          </div>

          {/* Session list — directly attached below player */}
          <div className="bg-htg-card border border-t-0 border-htg-card-border rounded-b-xl overflow-hidden">
            {filteredSessions.length === 0 ? (
              <div className="px-4 py-6 text-center text-htg-fg-muted text-sm">
                Brak sesji dla wybranego filtru
              </div>
            ) : (
              filteredSessions.map((session) => (
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
