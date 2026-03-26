'use client';

import { useTranslations } from 'next-intl';
import {
  AudioTrack,
  useParticipants,
  useTracks,
  TrackRefContext,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff } from 'lucide-react';
import SessionAnimation from './SessionAnimation';

export default function AudioOnlyView() {
  const t = useTranslations('Live');
  const participants = useParticipants();
  const audioTracks = useTracks([Track.Source.Microphone]);

  return (
    <div className="relative w-full h-full">
      <SessionAnimation variant={1} opacity={0.6} active />

      {/* Audio tracks (hidden, just for playback) */}
      {audioTracks.map((trackRef) => (
        <TrackRefContext.Provider key={trackRef.participant.identity + '-audio'} value={trackRef}>
          <AudioTrack trackRef={trackRef} />
        </TrackRefContext.Provider>
      ))}

      {/* Participant indicators */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-6 p-6">
        <div className="flex flex-wrap items-center justify-center gap-4">
          {participants.map((participant) => {
            const isSpeaking = participant.isSpeaking;
            const isMuted = !participant.isMicrophoneEnabled;

            return (
              <div
                key={participant.identity}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl
                  bg-black/20 backdrop-blur-sm border
                  ${isSpeaking ? 'border-htg-sage/50' : 'border-white/10'}`}
              >
                <div
                  className={`flex items-center justify-center w-16 h-16 rounded-full
                    ${isSpeaking ? 'bg-htg-sage/30' : 'bg-htg-lavender/20'}`}
                >
                  <span className="text-xl font-serif text-htg-cream">
                    {(participant.name ?? participant.identity)?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>

                <span className="text-sm text-htg-cream/80 truncate max-w-[120px]">
                  {participant.name ?? t('participant')}
                </span>

                <div className="flex items-center gap-1">
                  {isMuted ? (
                    <MicOff className="w-4 h-4 text-red-400" />
                  ) : isSpeaking ? (
                    <div className="flex items-end gap-0.5 h-4">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="w-1 bg-htg-sage rounded-full animate-pulse"
                          style={{
                            height: `${8 + Math.random() * 8}px`,
                            animationDelay: `${i * 100}ms`,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <Mic className="w-4 h-4 text-htg-cream/40" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
