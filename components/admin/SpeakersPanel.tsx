'use client';

import { useEffect, useState } from 'react';
import { Users, Loader2, AlertTriangle } from 'lucide-react';

/**
 * Panel widoczności mówców w edytorze Momentów.
 *
 * PR 1 (read-only empty state): ładuje aktywny import + segmenty z
 * /api/admin/fragments/sessions/[id]/speakers i pokazuje krótkie
 * podsumowanie (liczba mówców, łączny czas). Lane overlay i transcript
 * list przychodzą w PR 2. Gdy brak aktywnego importu — placeholder
 * "brak transkrypcji".
 */

interface Speaker {
  speakerKey: string;
  displayName: string | null;
  role: 'host' | 'client' | 'assistant' | 'unknown' | null;
  segmentCount: number;
  totalSec: number;
}

interface ActiveImport {
  id: string;
  source: 'manual' | 'livekit_phase2_pertrack' | 'livekit_phase2_diarize';
  status: 'processing' | 'ready' | 'failed' | 'superseded';
  createdAt: string;
}

interface Response {
  activeImport: ActiveImport | null;
  segments: unknown[];
  speakers: Speaker[];
}

const SOURCE_LABEL: Record<ActiveImport['source'], string> = {
  manual: 'ręczny seed',
  livekit_phase2_pertrack: 'LiveKit per-track',
  livekit_phase2_diarize: 'diarization',
};

function fmtSec(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function SpeakersPanel({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [data, setData] = useState<Response | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus('loading');
      setErrMsg(null);
      try {
        const res = await fetch(`/api/admin/fragments/sessions/${sessionId}/speakers`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as Response;
        if (cancelled) return;
        setData(json);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setErrMsg(e instanceof Error ? e.message : 'Błąd');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-htg-fg-muted" />
        <h3 className="text-sm font-semibold">Mówcy</h3>
        {status === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-htg-fg-muted" />}
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errMsg}</span>
        </div>
      )}

      {status === 'ready' && data && (
        data.activeImport === null || data.speakers.length === 0 ? (
          <p className="text-xs text-htg-fg-muted">
            Brak transkrypcji dla tej sesji. Lane mówców i transkrypcja pojawią się po wgraniu
            importu (manual / LiveKit Faza 2 / diarization).
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-htg-fg-muted">
              Źródło: {SOURCE_LABEL[data.activeImport.source]} ·{' '}
              {data.speakers.length} {data.speakers.length === 1 ? 'mówca' : 'mówców'}
            </p>
            <ul className="space-y-1">
              {data.speakers.map((s) => (
                <li
                  key={s.speakerKey}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="truncate">
                    {s.displayName ?? s.speakerKey}
                    {s.role && (
                      <span className="ml-2 text-htg-fg-muted">({s.role})</span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-htg-fg-muted shrink-0 ml-2">
                    {fmtSec(s.totalSec)} · {s.segmentCount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
