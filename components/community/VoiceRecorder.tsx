'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Send, Trash2, Loader2 } from 'lucide-react';
import type { Attachment } from '@/lib/community/types';

interface VoiceRecorderProps {
  groupId: string;
  onRecordingComplete: (attachment: Attachment) => void;
}

/**
 * Voice note recorder for community posts/comments.
 * Records audio using MediaRecorder API, displays waveform preview,
 * uploads to Bunny Storage via community media proxy.
 */
export function VoiceRecorder({ groupId, onRecordingComplete }: VoiceRecorderProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview' | 'uploading'>('idle');
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const MAX_DURATION = 120; // 2 minutes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioContextRef.current?.close();
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    setWaveformData([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Determine MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        audioUrlRef.current = URL.createObjectURL(blob);
        streamRef.current?.getTracks().forEach(t => t.stop());
        setState('preview');
      };

      recorder.start(500);
      setState('recording');
      setDuration(0);

      // Duration timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= MAX_DURATION - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      // Waveform animation
      const collectWaveform = () => {
        if (analyserRef.current && state === 'recording') {
          const data = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
          setWaveformData(prev => [...prev.slice(-100), avg]);
        }
        animationRef.current = requestAnimationFrame(collectWaveform);
      };
      collectWaveform();

    } catch (err) {
      setError('Nie udało się uzyskać dostępu do mikrofonu');
      console.error('Microphone error:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    mediaRecorderRef.current?.stop();
    audioContextRef.current?.close();
  }, []);

  const discardRecording = useCallback(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    blobRef.current = null;
    audioUrlRef.current = null;
    setWaveformData([]);
    setDuration(0);
    setState('idle');
  }, []);

  const uploadRecording = useCallback(async () => {
    if (!blobRef.current) return;
    setState('uploading');

    try {
      const formData = new FormData();
      formData.append('file', blobRef.current, 'voice-note.webm');
      formData.append('group_id', groupId);

      // Override allowed types for audio upload
      const res = await fetch('/api/community/media/upload-audio', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const { path } = await res.json();

      onRecordingComplete({
        type: 'audio',
        url: path,
        status: 'ready',
        metadata: {
          duration_sec: duration,
          waveform: waveformData.slice(0, 50), // Compact waveform
        },
      });

      discardRecording();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload nieudany');
      setState('preview');
    }
  }, [groupId, duration, waveformData, onRecordingComplete, discardRecording]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      {state === 'idle' && (
        <button
          onClick={startRecording}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
          title="Nagraj głosówkę"
        >
          <Mic className="w-4 h-4" />
        </button>
      )}

      {state === 'recording' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-red-500 font-medium tabular-nums">
            {formatTime(duration)}
          </span>

          {/* Mini waveform */}
          <div className="flex items-end gap-px h-5">
            {waveformData.slice(-20).map((v, i) => (
              <div
                key={i}
                className="w-0.5 bg-red-400 rounded-full transition-all"
                style={{ height: `${Math.max(2, v * 20)}px` }}
              />
            ))}
          </div>

          <button
            onClick={stopRecording}
            className="p-1 rounded bg-red-500 text-white hover:bg-red-600"
          >
            <Square className="w-3 h-3" />
          </button>
        </div>
      )}

      {state === 'preview' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-htg-surface rounded-lg">
          <audio
            src={audioUrlRef.current || undefined}
            controls
            className="h-8 max-w-[200px]"
          />
          <span className="text-xs text-htg-fg-muted tabular-nums">
            {formatTime(duration)}
          </span>
          <button
            onClick={discardRecording}
            className="p-1 rounded text-htg-fg-muted hover:text-red-500"
            title="Usuń"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={uploadRecording}
            className="p-1.5 rounded bg-htg-sage text-white hover:bg-htg-sage-dark"
            title="Wyślij"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {state === 'uploading' && (
        <div className="flex items-center gap-2 px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-htg-sage" />
          <span className="text-sm text-htg-fg-muted">Przesyłanie...</span>
        </div>
      )}

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}
