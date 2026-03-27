'use client';

import {
  VideoTrack,
  useParticipants,
  useTracks,
  RoomAudioRenderer,
  type TrackReference,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic } from 'lucide-react';

export default function LiveVideoGrid() {
  const participants = useParticipants();

  // onlySubscribed: false — include local participant's own camera track
  const videoTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  return (
    <div className="w-full h-full p-4 relative">
      {/* RoomAudioRenderer handles all remote audio playback */}
      <RoomAudioRenderer />

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
          const isSpeaking = participant.isSpeaking;

          return (
            <div
              key={participant.identity}
              className={`relative rounded-xl overflow-hidden bg-htg-indigo
                flex items-center justify-center
                ${isSpeaking ? 'ring-4 ring-htg-sage ring-offset-2' : ''}`}
            >
              {videoTrack && 'publication' in videoTrack ? (
                <VideoTrack
                  trackRef={videoTrack as TrackReference}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 w-full h-full">
                  <div className="flex items-center justify-center w-20 h-20 rounded-full bg-htg-lavender/30">
                    <span className="text-3xl font-serif text-htg-cream">
                      {(participant.name ?? participant.identity)?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <span className="text-htg-cream/60 text-xs">Kamera wyłączona</span>
                </div>
              )}

              {/* Name overlay */}
              <div className="absolute bottom-0 left-0 right-0 px-3 py-2
                bg-gradient-to-t from-black/60 to-transparent
                flex items-center gap-2">
                {isSpeaking && (
                  <Mic className="w-4 h-4 text-htg-sage flex-shrink-0 animate-pulse" />
                )}
                <span className="text-sm text-white font-medium truncate">
                  {participant.name && participant.name.trim()
                    ? participant.name
                    : participant.identity.length > 20
                      ? 'Uczestnik'
                      : participant.identity}
                </span>
              </div>
            </div>
          );
        })}

        {participants.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-htg-cream/40 text-sm">Łączenie z uczestnikami...</p>
          </div>
        )}
      </div>
    </div>
  );
}
