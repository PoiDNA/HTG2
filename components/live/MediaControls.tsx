'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, MicOff, Video, VideoOff, Pause, Check } from 'lucide-react';
import type { Room } from 'livekit-client';

interface MediaControlsProps {
  room: Room | null;
  showVideo?: boolean;
  /** Show pause/break request button (clients only) */
  showBreak?: boolean;
}

export default function MediaControls({ room, showVideo = true, showBreak = false }: MediaControlsProps) {
  const t = useTranslations('Live');
  const [breakRequested, setBreakRequested] = useState(false);

  const micEnabled = room?.localParticipant.isMicrophoneEnabled ?? true;
  const camEnabled = room?.localParticipant.isCameraEnabled ?? true;

  const toggleMic = useCallback(async () => {
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!micEnabled);
    } catch (err) {
      console.error('Failed to toggle mic:', err);
    }
  }, [room, micEnabled]);

  const toggleCam = useCallback(async () => {
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(!camEnabled);
    } catch (err) {
      console.error('Failed to toggle camera:', err);
    }
  }, [room, camEnabled]);

  const requestBreak = useCallback(async () => {
    if (!room || breakRequested) return;
    try {
      const encoder = new TextEncoder();
      await room.localParticipant.publishData(
        encoder.encode(JSON.stringify({ type: 'break_request' })),
        { reliable: true },
      );
      setBreakRequested(true);
    } catch (err) {
      console.error('Failed to send break request:', err);
    }
  }, [room, breakRequested]);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggleMic}
        title={micEnabled ? t('mic_off') : t('mic_on')}
        className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors ${
          micEnabled
            ? 'bg-white/20 text-white hover:bg-white/30'
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
              ? 'bg-white/20 text-white hover:bg-white/30'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {camEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
      )}

      {showBreak && (
        <button
          onClick={requestBreak}
          disabled={breakRequested}
          title={breakRequested ? t('break_confirmed') : t('break_request')}
          className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors ${
            breakRequested
              ? 'bg-htg-sage/40 text-htg-sage cursor-default'
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
        >
          {breakRequested ? <Check className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
}
