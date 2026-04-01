'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, ChevronDown, Clock } from 'lucide-react';
import type { MonthSection, VodSession } from '@/lib/services/vod-library';
import VideoPlayer from '@/components/video/VideoPlayer';

type Props = {
  sections: MonthSection[];
  singleSessions: VodSession[];
  futureMonthsCount: number;
  userId: string;
  userEmail: string;
};

export default function VodLibraryClient({ sections, singleSessions, futureMonthsCount, userId, userEmail }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(() => {
    const firstNonEmptySection = sections.find(s => s.sessions.length > 0);
    return firstNonEmptySection ? firstNonEmptySection.monthLabel : (singleSessions.length > 0 ? 'singles' : null);
  });
  
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <AccordionMonth
          key={section.monthLabel}
          title={section.title}
          sessionsCount={section.sessions.length}
          isExpanded={expandedKey === section.monthLabel}
          onToggle={() => toggleSection(section.monthLabel)}
        >
          {section.sessions.length === 0 ? (
            <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center text-htg-fg-muted">
              Sesje w przygotowaniu
            </div>
          ) : (
            <div className="space-y-4">
              {section.sessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isPlaying={playingSessionId === session.id}
                  onTogglePlay={() => togglePlay(session.id)}
                  userId={userId}
                  userEmail={userEmail}
                />
              ))}
            </div>
          )}
        </AccordionMonth>
      ))}

      {singleSessions.length > 0 && (
        <AccordionMonth
          title="Sesje pojedyncze"
          sessionsCount={singleSessions.length}
          isExpanded={expandedKey === 'singles'}
          onToggle={() => toggleSection('singles')}
        >
          <div className="space-y-4">
            {singleSessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                isPlaying={playingSessionId === session.id}
                onTogglePlay={() => togglePlay(session.id)}
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
  isExpanded, 
  onToggle, 
  children 
}: { 
  title: string; 
  sessionsCount: number; 
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

function SessionCard({ 
  session, 
  isPlaying, 
  onTogglePlay, 
  userId, 
  userEmail 
}: { 
  session: VodSession; 
  isPlaying: boolean; 
  onTogglePlay: () => void; 
  userId: string; 
  userEmail: string;
}) {
  const [expandedDesc, setExpandedDesc] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPlaying && playerRef.current) {
      setTimeout(() => {
        playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [isPlaying]);

  return (
    <div className="border border-htg-card-border rounded-lg overflow-hidden bg-htg-surface/30">
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
            {session.isPlayable && (
              <button
                onClick={onTogglePlay}
                className="shrink-0 flex items-center gap-2 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {isPlaying ? 'Zamknij' : 'Odsłuchaj'}
              </button>
            )}
          </div>
          
          {session.description && (
            <div className="mt-2 text-sm text-htg-fg-muted">
              <p className={expandedDesc ? '' : 'line-clamp-2'}>
                {session.description}
              </p>
              {session.description.length > 100 && (
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
          <VideoPlayer
            playbackId={session.id}
            idFieldName="sessionId"
            userId={userId}
            userEmail={userEmail}
          />
        </div>
      )}
    </div>
  );
}