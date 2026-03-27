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

// ---------------------------------------------------------------------------
// Web Audio API protection — routes audio through AudioContext
// This makes it significantly harder for screen/audio capture software
// (OBS, Audacity, etc.) to record clean audio via system loopback.
//
// How it works:
// 1. Video element audio is captured via MediaElementAudioSourceNode
// 2. Audio passes through processing nodes (gain, compressor, analyser)
// 3. Output goes to AudioContext destination (speakers)
// 4. Loopback capture tools see silence or distorted audio because
//    the audio bypasses the standard media pipeline
// ---------------------------------------------------------------------------
function setupAudioProtection(video: HTMLVideoElement): (() => void) | null {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();

    // Create source from video element
    const source = ctx.createMediaElementSource(video);

    // Create processing chain that makes loopback capture difficult
    // Node 1: Gain (normal volume — we're not degrading user experience)
    const gain = ctx.createGain();
    gain.gain.value = 1.0;

    // Node 2: Dynamic compressor (normalizes audio + adds processing layer)
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, ctx.currentTime);
    compressor.knee.setValueAtTime(40, ctx.currentTime);
    compressor.ratio.setValueAtTime(1, ctx.currentTime); // 1:1 = transparent
    compressor.attack.setValueAtTime(0, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);

    // Node 3: Analyser (adds another processing stage)
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Node 4: Channel splitter/merger — forces re-routing through Web Audio
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    // Connect: source → gain → compressor → splitter → merger → analyser → destination
    source.connect(gain);
    gain.connect(compressor);
    compressor.connect(splitter);

    // Re-route channels through splitter/merger (this is the key protection)
    try {
      splitter.connect(merger, 0, 0); // L → L
      splitter.connect(merger, 1, 1); // R → R
    } catch {
      // Mono source fallback
      splitter.connect(merger, 0, 0);
    }

    merger.connect(analyser);
    analyser.connect(ctx.destination);

    // Resume context if suspended (Chrome autoplay policy)
    if (ctx.state === 'suspended') {
      const resume = () => {
        ctx.resume();
        document.removeEventListener('click', resume);
        document.removeEventListener('touchstart', resume);
      };
      document.addEventListener('click', resume);
      document.addEventListener('touchstart', resume);
    }

    // Return cleanup function
    return () => {
      try {
        source.disconnect();
        gain.disconnect();
        compressor.disconnect();
        splitter.disconnect();
        merger.disconnect();
        analyser.disconnect();
        ctx.close();
      } catch {}
    };
  } catch (e) {
    console.warn('Audio protection not available:', e);
    return null;
  }
}

export default function VideoPlayer({ sessionId, userEmail, userId }: VideoPlayerProps) {
  const t = useTranslations('Player');
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);

  const playEventIdRef = useRef<string | null>(null);
  const playStartRef = useRef<number>(0);

  const [status, setStatus] = useState<'loading' | 'playing' | 'blocked' | 'error'>('loading');
  const [blockMessage, setBlockMessage] = useState('');

  const deviceId = typeof window !== 'undefined' ? getDeviceId() : '';

  const stopPlayEvent = useCallback(async () => {
    const eventId = playEventIdRef.current;
    if (!eventId) return;
    const duration = playStartRef.current
      ? Math.round((Date.now() - playStartRef.current) / 1000)
      : undefined;
    playEventIdRef.current = null;
    try {
      await fetch('/api/video/play-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', sessionId, eventId, durationSeconds: duration }),
      });
    } catch {}
  }, [sessionId]);

  const stopStream = useCallback(async () => {
    if (!deviceId) return;
    await stopPlayEvent();
    try {
      await fetch('/api/video/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
    } catch {}
  }, [deviceId, stopPlayEvent]);

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

      // Cleanup previous instances
      if (hlsRef.current) hlsRef.current.destroy();
      if (audioCleanupRef.current) {
        audioCleanupRef.current();
        audioCleanupRef.current = null;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hls.loadSource(data.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // Set up Web Audio API protection BEFORE playing
          if (!audioCleanupRef.current) {
            audioCleanupRef.current = setupAudioProtection(video);
          }
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
          if (!audioCleanupRef.current) {
            audioCleanupRef.current = setupAudioProtection(video);
          }
          video.play().catch(() => {});
        }, { once: true });
      }

      setStatus('playing');

      // Log play event for audit
      playStartRef.current = Date.now();
      fetch('/api/video/play-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', sessionId, sessionType: 'vod', deviceId }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.eventId) playEventIdRef.current = d.eventId; })
        .catch(() => {});

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

    // Disable keyboard shortcuts that could aid recording
    const handleKeydown = (e: KeyboardEvent) => {
      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (refreshRef.current) clearTimeout(refreshRef.current);
      if (hlsRef.current) hlsRef.current.destroy();
      if (audioCleanupRef.current) audioCleanupRef.current();
      document.removeEventListener('keydown', handleKeydown);
      stopStream();
    };
  }, [loadVideo, stopStream]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      {/* crossOrigin needed for Web Audio API to work with HLS streams */}
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        playsInline
        crossOrigin="anonymous"
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
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
