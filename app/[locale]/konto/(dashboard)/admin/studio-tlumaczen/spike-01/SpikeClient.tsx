'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

// ── MIME preference hierarchy ──────────────────────────────────────────────
const MIME_PREFERENCE = [
  'audio/webm;codecs=opus',
  'audio/mp4;codecs=aac',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
] as const;

type MimeType = typeof MIME_PREFERENCE[number];

function getSupportedMimeType(): string {
  const type = MIME_PREFERENCE.find(t => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('No supported audio recording MIME type in this browser');
  return type;
}

// ── Types ──────────────────────────────────────────────────────────────────
type RecordingState = 'idle' | 'recording' | 'stopped';

interface MimeRow {
  mime: MimeType;
  supported: boolean;
}

interface ProbeResult {
  server_readable: boolean;
  received_size: number;
  content_type_header: string;
  reported_mime: string | null;
  reported_duration_sec: number | null;
  browser: string | null;
  platform: string | null;
  magic_bytes: string;
  magic_detected: string;
  sha256_prefix: string;
  timestamp: string;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function SpikeClient() {
  const [mimeMatrix, setMimeMatrix] = useState<MimeRow[]>([]);
  const [selectedMime, setSelectedMime] = useState<string>('');
  const [mimeError, setMimeError] = useState<string | null>(null);

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Build MIME matrix on mount
  useEffect(() => {
    const rows: MimeRow[] = MIME_PREFERENCE.map(mime => ({
      mime,
      supported: MediaRecorder.isTypeSupported(mime),
    }));
    setMimeMatrix(rows);
    try {
      setSelectedMime(getSupportedMimeType());
    } catch (e) {
      setMimeError(String(e));
    }
  }, []);

  // Canvas waveform animation
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufLen = analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(dataArr);

    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a78bfa';
    ctx.beginPath();

    const sliceWidth = canvas.width / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = dataArr[i] / 128.0;
      const y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const stopVisualization = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    // Draw flat line on canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#52525b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
    }
  }, []);

  async function startRecording() {
    if (mimeError) return;
    chunksRef.current = [];
    setAudioUrl(null);
    setAudioBlob(null);
    setAudioDuration(null);
    setProbeResult(null);
    setProbeError(null);
    setElapsed(0);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // MediaRecorder MUST be created and started BEFORE Web Audio setup.
    // In Chrome, createMediaStreamSource() takes ownership of the stream's
    // audio track — if called first, MediaRecorder gets a silent/empty track
    // and produces only a WebM header (~1KB) with no audio frames.
    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stopVisualization();
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;

      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setAudioBlob(blob);
      setAudioUrl(url);

      try {
        const arrBuf = await blob.arrayBuffer();
        const tmpCtx = new AudioContext();
        const decoded = await tmpCtx.decodeAudioData(arrBuf);
        setAudioDuration(decoded.duration);
        await tmpCtx.close();
      } catch {
        // Duration detection failed — not critical for spike
      }

      setRecordingState('stopped');
    };

    recorder.start();

    // Web Audio visualizer — initialized AFTER recorder.start()
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyserRef.current = analyser;
    animFrameRef.current = requestAnimationFrame(drawWaveform);
    setRecordingState('recording');

    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    // Auto-stop at 15s
    autoStopRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === 'recording') stopRecording();
    }, 15_000);
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    mediaRecorderRef.current?.stop();
  }

  async function uploadToServer() {
    if (!audioBlob || !selectedMime) return;
    setUploading(true);
    setProbeResult(null);
    setProbeError(null);

    try {
      const fd = new FormData();
      fd.append('audio', audioBlob, 'recording');
      fd.append('mimeType', selectedMime);
      fd.append('duration', String(audioDuration ?? ''));
      fd.append('browser', navigator.userAgent);
      fd.append('platform', navigator.platform);

      const res = await fetch('/api/admin/studio-spike/probe', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? res.statusText);
      }

      setProbeResult(await res.json());
    } catch (e) {
      setProbeError(String(e));
    } finally {
      setUploading(false);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const isRecording = recordingState === 'recording';
  const hasStopped = recordingState === 'stopped';

  return (
    <div className="space-y-8">

      {/* MIME matrix */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          MIME matrix — ta przeglądarka
        </h2>
        {mimeError ? (
          <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm font-mono">
            ✗ {mimeError}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-left">
                <th className="pb-1 font-normal">MIME type</th>
                <th className="pb-1 font-normal">isTypeSupported</th>
                <th className="pb-1 font-normal">Użyty</th>
              </tr>
            </thead>
            <tbody className="font-mono divide-y divide-zinc-800">
              {mimeMatrix.map(row => (
                <tr key={row.mime} className={row.supported ? '' : 'opacity-40'}>
                  <td className="py-1.5 pr-4 text-zinc-200">{row.mime}</td>
                  <td className="py-1.5 pr-4">
                    {row.supported
                      ? <span className="text-green-400">✓ true</span>
                      : <span className="text-zinc-500">✗ false</span>}
                  </td>
                  <td className="py-1.5">
                    {row.mime === selectedMime && (
                      <span className="bg-violet-900 text-violet-200 px-2 py-0.5 rounded text-xs">wybrany</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recording */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          Nagrywanie (max 15 sek.)
        </h2>

        <canvas
          ref={canvasRef}
          width={640}
          height={80}
          className="w-full rounded-lg bg-zinc-900 mb-4"
        />

        <div className="flex items-center gap-3 mb-4">
          {!isRecording && !hasStopped && (
            <button
              onClick={startRecording}
              disabled={!!mimeError}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-white inline-block" />
              Nagraj
            </button>
          )}

          {isRecording && (
            <>
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                ⏹ Stop
              </button>
              <span className="text-sm text-red-400 font-mono animate-pulse">
                ● {elapsed}s / 15s
              </span>
            </>
          )}

          {hasStopped && (
            <button
              onClick={() => { setRecordingState('idle'); setAudioUrl(null); setAudioBlob(null); }}
              className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              ↺ Nagraj ponownie
            </button>
          )}
        </div>

        {audioUrl && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">
              Podgląd lokalny
              {audioDuration != null && (
                <span className="ml-2 text-zinc-300 font-mono">{audioDuration.toFixed(2)}s</span>
              )}
              <span className="ml-2 text-zinc-500 font-mono">
                {audioBlob ? `${(audioBlob.size / 1024).toFixed(1)} KB` : ''}
              </span>
            </p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}
      </section>

      {/* Upload */}
      {hasStopped && audioBlob && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
            Wyślij do serwera
          </h2>
          <button
            onClick={uploadToServer}
            disabled={uploading}
            className="bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {uploading ? 'Wysyłanie…' : '↑ Probe endpoint'}
          </button>

          {probeError && (
            <div className="mt-4 bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm font-mono">
              ✗ {probeError}
            </div>
          )}

          {probeResult && (
            <div className="mt-4">
              <p className="text-xs text-green-400 mb-2">
                ✓ Serwer odczytał blob poprawnie
              </p>
              <table className="w-full text-sm font-mono">
                <tbody className="divide-y divide-zinc-800">
                  {Object.entries(probeResult).map(([k, v]) => (
                    <tr key={k}>
                      <td className="py-1.5 pr-4 text-zinc-400 align-top">{k}</td>
                      <td className="py-1.5 text-zinc-100 break-all">
                        {typeof v === 'boolean'
                          ? (v ? <span className="text-green-400">true</span> : <span className="text-red-400">false</span>)
                          : String(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

    </div>
  );
}
