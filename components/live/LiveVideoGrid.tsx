'use client';

import { useTranslations } from 'next-intl';
import {
  VideoTrack,
  AudioTrack,
  useParticipants,
  useTracks,
  TrackRefContext,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic } from 'lucide-react';

export default function LiveVideoGrid() {
  const t = useTranslations('Live');
  const participants = useParticipants();
  const videoTracks = useTracks([Track.Source.Camera]);
  const audioTracks = useTracks([Track.Source.Microphone]);

  return (
    <div className="w-full h-full p-4">
      <div
        className={`grid gap-4 h-full ${
          participants.length <= 1
            ? 'grid-cols-1'
            : participants.length <= 4
              ? 'grid-cols-2'
              : 'grid-cols-3'
        }`}
      >
        {participants.map((participant) => {
          const videoTrack = videoTracks.find(
            (t) => t.participant.identity === participant.identity,
          );
          const audioTrack = audioTracks.find(
            (t) => t.participant.identity === participant.identity,
          );
          const isSpeaking = participant.isSpeaking;

          return (
            <div
              key={participant.identity}
              className={`relative rounded-xl overflow-hidden bg-htg-indigo
                flex items-center justify-center
                ${isSpeaking ? 'ring-2 ring-htg-sage' : ''}`}
            >
              {videoTrack ? (
                <TrackRefContext.Provider value={videoTrack}>
                  <VideoTrack
                    trackRef={videoTrack}
                    className="w-full h-full object-cover"
                  />
                </TrackRefContext.Provider>
              ) : (
                <div className="flex items-center justify-center w-20 h-20 rounded-full bg-htg-lavender/30">
                  <span className="text-2xl font-serif text-htg-cream">
                    {(participant.name ?? participant.identity)?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
              )}

              {audioTrack && (
                <TrackRefContext.Provider value={audioTrack}>
                  <AudioTrack trackRef={audioTrack} />
                </TrackRefContext.Provider>
              )}

              {/* Name overlay */}
              <div className="absolute bottom-0 left-0 right-0 px-3 py-2
                bg-gradient-to-t from-black/50 to-transparent
                flex items-center gap-2">
                {isSpeaking && (
                  <Mic className="w-4 h-4 text-htg-sage flex-shrink-0" />
                )}
                <span className="text-sm text-white truncate">
                  {participant.name ?? t('participant')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
