'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Mic, Square, Upload, Check, Loader2, Trash2 } from 'lucide-react';

interface ClientRecorderProps {
  bookingId: string;
  liveSessionId: string;
  type: 'before' | 'after';
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
}

// Rigorous video constraints to avoid OOM on mobile (Safari iOS especially).
// MediaRecorder keeps the full blob in browser RAM. 5 minutes of 1080p30 from
// a modern phone camera can be 100-500 MB, crashing the tab around minute 3-4.
// For a before/after "therapeutic diary" 640x480 @ 15fps is plenty.
// 'ideal' vs 'exact' — browsers may still give a different resolution if the
// native camera size fits better; this is a hint to the selector, not a guarantee.
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640, max: 1280 },
  height: { ideal: 480, max: 720 },
  frameRate: { ideal: 15, max: 24 },
  facingMode: 'user',
};

// Different time limits per type to avoid bufferbloat killing the LiveKit
// upload that starts right after a 'before' recording. 'after' has no
// follow-up WebRTC session so can be longer.
const MAX_DURATION_SECONDS: Record<'before' | 'after', number> = {
  before: 60,
  after: 300,
};

// Candidate MIME types ordered by quality preference. isTypeSupported() picks
// the first one the browser accepts. Safari iOS historically does not support
// WebM recording — needs MP4/H.264 fallback.
function pickSupportedMimeType(format: 'video' | 'audio'): string | null {
  const candidates = format === 'video'
    ? [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // Safari iOS
        'video/mp4',
      ]
    : [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2', // Safari iOS
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];

  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

function extFromMimeType(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return mime.startsWith('audio/') ? 'm4a' : 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'bin';
}

export default function ClientRecorder({ bookingId, liveSessionId, type, onRecordingStart, onRecordingStop }: ClientRecorderProps) {
  const [mode, setMode] = useState<'idle' | 'choosing' | 'recording' | 'preview' | 'uploading' | 'done'>('idle');
  const [format, setFormat] = useState<'video' | 'audio'>('video');
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const recordingBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const label = type === 'before' ? 'przed sesją' : 'po sesji';

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }, []);

  async function startRecording() {
    setError('');
    chunksRef.current = [];

    try {
      const constraints: MediaStreamConstraints = format === 'video'
        ? { video: VIDEO_CONSTRAINTS, audio: true }
        : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Show preview while recording
      if (videoPreviewRef.current && format === 'video') {
        videoPreviewRef.current.srcObject = stream;
      }

      // Pick the best supported MIME type for this device.
      // Safari iOS does not support WebM recording — must fall back to MP4.
      const mimeType = pickSupportedMimeType(format);
      if (!mimeType) {
        throw new Error('Twoja przeglądarka nie wspiera nagrywania w żadnym znanym formacie');
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        recordingBlobRef.current = blob;

        // Show preview
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
          videoPreviewRef.current.src = URL.createObjectURL(blob);
        }

        streamRef.current?.getTracks().forEach(t => t.stop());
        setMode('preview');
        onRecordingStop?.();
      };

      recorder.start(1000); // collect data every second
      setMode('recording');
      onRecordingStart?.();
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd';
      setError(`Nie udało się uzyskać dostępu do ${format === 'video' ? 'kamery' : 'mikrofonu'}: ${message}`);
      setMode('choosing');
    }
  }

  function discardRecording() {
    recordingBlobRef.current = null;
    if (videoPreviewRef.current) {
      videoPreviewRef.current.src = '';
    }
    setMode('choosing');
    setDuration(0);
    // Music already restored on stop — no extra call needed
  }

  async function uploadRecording() {
    // Concurrency guard — prevent double-submit from impatient double-click
    // or React re-render firing onClick twice on laggy devices.
    if (!recordingBlobRef.current || mode === 'uploading' || mode === 'done') return;
    setMode('uploading');
    setError('');

    try {
      const blob = recordingBlobRef.current;
      // Use the actual recorded MIME type — Safari iOS outputs MP4 even when
      // we asked for WebM first, so hardcoding .webm would give the wrong
      // extension and confuse the backend's magic-bytes check.
      const ext = extFromMimeType(blob.type);

      const formData = new FormData();
      const fileName = `${type}-${Date.now()}.${ext}`;
      formData.append('file', blob, fileName);
      formData.append('bookingId', bookingId);
      formData.append('liveSessionId', liveSessionId);
      formData.append('type', type);
      formData.append('format', format);
      formData.append('duration', String(duration));

      const res = await fetch('/api/live/client-recording', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      setMode('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd uploadu');
      setMode('preview');
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Max duration depends on type — 'before' is short (60s) to avoid bufferbloat
  // killing the LiveKit session that starts right after the waiting room.
  // 'after' has no follow-up WebRTC so can be longer (5 min).
  useEffect(() => {
    const maxDuration = MAX_DURATION_SECONDS[type];
    if (mode === 'recording' && duration >= maxDuration) {
      stopRecording();
    }
  }, [duration, mode, type, stopRecording]);

  if (mode === 'done') {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-900/20 border border-green-800/30">
        <Check className="w-5 h-5 text-green-400" />
        <span className="text-green-400 text-sm font-medium">
          Nagranie {label} zapisane ({formatTime(duration)})
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-black/40 backdrop-blur-md border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-white/80 text-sm font-medium">
          {format === 'video' ? <Video className="w-4 h-4 inline mr-1.5" /> : <Mic className="w-4 h-4 inline mr-1.5" />}
          Nagranie {label}
        </p>
      </div>

      <div className="p-4">
        {/* Choose mode */}
        {(mode === 'idle' || mode === 'choosing') && (
          <div className="space-y-3">
            <p className="text-white/50 text-xs">Nagraj swoje przemyślenia {label} (max {formatTime(MAX_DURATION_SECONDS[type])})</p>

            <div className="flex gap-2">
              <button
                onClick={() => { setFormat('video'); setMode('choosing'); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors ${
                  format === 'video' && mode === 'choosing'
                    ? 'bg-htg-sage text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                <Video className="w-4 h-4" /> Wideo
              </button>
              <button
                onClick={() => { setFormat('audio'); setMode('choosing'); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors ${
                  format === 'audio' && mode === 'choosing'
                    ? 'bg-htg-sage text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                <Mic className="w-4 h-4" /> Audio
              </button>
            </div>

            {mode === 'choosing' && (
              <button
                onClick={startRecording}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-500 transition-colors flex items-center justify-center gap-2"
              >
                <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                Rozpocznij nagrywanie
              </button>
            )}

            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        )}

        {/* Recording */}
        {mode === 'recording' && (
          <div className="space-y-3">
            {format === 'video' && (
              <video ref={videoPreviewRef} autoPlay playsInline muted className="w-full rounded-lg aspect-video object-cover bg-black" />
            )}

            {format === 'audio' && (
              <div className="flex items-center justify-center py-8">
                <div className="w-16 h-16 rounded-full bg-red-600/30 flex items-center justify-center animate-pulse">
                  <Mic className="w-8 h-8 text-red-400" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 text-sm font-mono">{formatTime(duration)}</span>
                <span className="text-white/30 text-xs">/ {formatTime(MAX_DURATION_SECONDS[type])}</span>
              </div>
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
              >
                <Square className="w-4 h-4" /> Stop
              </button>
            </div>
          </div>
        )}

        {/* Preview */}
        {mode === 'preview' && (
          <div className="space-y-3">
            {format === 'video' ? (
              <video ref={videoPreviewRef} controls className="w-full rounded-lg aspect-video object-cover bg-black" />
            ) : (
              <audio ref={videoPreviewRef as any} controls className="w-full" />
            )}

            <p className="text-white/50 text-xs text-center">{formatTime(duration)}</p>

            <div className="flex gap-2">
              <button
                onClick={discardRecording}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/10 text-white/70 text-sm hover:bg-white/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Odrzuć
              </button>
              <button
                onClick={uploadRecording}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/90 transition-colors"
              >
                <Upload className="w-4 h-4" /> Zapisz
              </button>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        )}

        {/* Uploading */}
        {mode === 'uploading' && (
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="w-5 h-5 text-htg-sage animate-spin" />
            <span className="text-white/70 text-sm">Zapisywanie nagrania...</span>
          </div>
        )}
      </div>
    </div>
  );
}
