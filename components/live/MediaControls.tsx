'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import type { Room } from 'livekit-client';

interface MediaControlsProps {
  room: Room | null;
  showVideo?: boolean;
}

export default function MediaControls({ room, showVideo = true }: MediaControlsProps) {
  const t = useTranslations('Live');
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!micEnabled);
      setMicEnabled(!micEnabled);
    } catch (err) {
      console.error('Failed to toggle mic:', err);
    }
  }, [room, micEnabled]);

  const toggleCam = useCallback(async () => {
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(!camEnabled);
      setCamEnabled(!camEnabled);
    } catch (err) {
      console.error('Failed to toggle camera:', err);
    }
  }, [room, camEnabled]);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggleMic}
        title={micEnabled ? t('mic_off') : t('mic_on')}
        className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors ${
          micEnabled
            ? 'bg-htg-surface text-htg-fg hover:bg-htg-surface/80'
            : 'bg-red-600 text-white hover:bg-red-700'
        }`}
      >
        {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {showVideo && (
        <button
          onClick={toggleCam}
          title={camEnabled ? t('cam_off') : t('cam_on')}
          className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors ${
            camEnabled
              ? 'bg-htg-surface text-htg-fg hover:bg-htg-surface/80'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {camEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
}
