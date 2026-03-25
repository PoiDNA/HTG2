'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Hls from 'hls.js';
import WatermarkOverlay from './WatermarkOverlay';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface VideoPlayerProps {
  sessionId: string;
  userEmail: string;
  userId: string;
}

function getDeviceId(): string {
  const key = 'htg-device-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function VideoPlayer({ sessionId, userEmail, userId }: VideoPlayerProps) {
  const t = useTranslations('Player');
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<'loading' | 'playing' | 'blocked' | 'error'>('loading');
  const [blockMessage, setBlockMessage] = useState('');

  const deviceId = typeof window !== 'undefined' ? getDeviceId() : '';

  const stopStream = useCallback(async () => {
    if (!deviceId) return;
    try {
      await fetch('/api/video/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
    } catch {}
  }, [deviceId]);

  const loadVideo = useCallback(async () => {
    setStatus('loading');

    try {
      const res = await fetch('/api/video/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, deviceId }),
      });

      const data = await res.json();

      if (!data.allowed) {
        setStatus('blocked');
        setBlockMessage(data.message || t('concurrent_message'));
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      // Cleanup previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hls.loadSource(data.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, errData) => {
          if (errData.fatal) {
            setStatus('error');
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = data.url;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
        });
      }

      setStatus('playing');

      // Start heartbeat every 30s
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(async () => {
        try {
          const hbRes = await fetch('/api/video/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId }),
          });
          const hbData = await hbRes.json();
          if (!hbData.allowed) {
            video.pause();
            setStatus('blocked');
            setBlockMessage(t('concurrent_message'));
          }
        } catch {}
      }, 30000);

      // Schedule signed URL refresh at 14 minutes (1 min before 15 min expiry)
      if (refreshRef.current) clearTimeout(refreshRef.current);
      refreshRef.current = setTimeout(() => {
        loadVideo();
      }, (data.expiresIn - 60) * 1000);
    } catch {
      setStatus('error');
    }
  }, [sessionId, deviceId, t]);

  useEffect(() => {
    loadVideo();

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (refreshRef.current) clearTimeout(refreshRef.current);
      if (hlsRef.current) hlsRef.current.destroy();
      stopStream();
    };
  }, [loadVideo, stopStream]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        playsInline
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
      />

      {status === 'playing' && (
        <WatermarkOverlay userEmail={userEmail} userId={userId} />
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
            <p className="text-sm">{t('loading')}</p>
          </div>
        </div>
      )}

      {status === 'blocked' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <div className="text-center text-white max-w-md px-6">
            <AlertCircle className="w-12 h-12 text-htg-warm mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('concurrent_title')}</h3>
            <p className="text-white/70 text-sm mb-6">{blockMessage}</p>
            <button
              onClick={loadVideo}
              className="bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              {t('retry')}
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <div className="text-center text-white">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm">{t('error')}</p>
            <button
              onClick={loadVideo}
              className="mt-4 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm hover:bg-htg-sage-dark transition-colors"
            >
              {t('retry')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
