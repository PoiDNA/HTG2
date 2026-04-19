'use client';

import { useEffect, useState } from 'react';
import { Users, Loader2, AlertTriangle } from 'lucide-react';
import SpeakerLane from './SpeakerLane';
import TranscriptSegmentList from '@/components/transcript/TranscriptSegmentList';
import type { SpeakersResponse } from '@/lib/speakers/client';

/**
 * Panel widoczności mówców + transkrypcji (PR 2).
 *
 * Ładuje aktywny import z /api/admin/fragments/sessions/[id]/speakers,
 * renderuje lane overlay, legendę i synchronizowaną listę transkrypcji.
 * Reaguje na `currentSec` z playera i propaguje seek przez `onSeek`.
 */

const SOURCE_LABEL: Record<NonNullable<SpeakersResponse['activeImport']>['source'], string> = {
  manual: 'ręczny seed',
  livekit_phase2_pertrack: 'LiveKit per-track',
  livekit_phase2_diarize: 'diarization',
};

interface Props {
  sessionId: string;
  durationSec: number;
  currentSec: number;
  onSeek: (sec: number) => void;
  /** Callback z pełnym response (dla parenta — ekstrakcja tekstu per Moment). */
  onData?: (data: SpeakersResponse) => void;
}

export default function SpeakersPanel({
  sessionId, durationSec, currentSec, onSeek, onData,
}: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [data, setData] = useState<SpeakersResponse | null>(null);

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
        const json = (await res.json()) as SpeakersResponse;
        if (cancelled) return;
        setData(json);
        setStatus('ready');
        onData?.(json);
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setErrMsg(e instanceof Error ? e.message : 'Błąd');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId, onData]);

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-htg-fg-muted" />
        <h3 className="text-sm font-semibold">Mówcy i transkrypcja</h3>
        {status === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-htg-fg-muted" />}
        {status === 'ready' && data?.activeImport && (
          <span className="text-[11px] text-htg-fg-muted ml-auto">
            Źródło: {SOURCE_LABEL[data.activeImport.source]}
          </span>
        )}
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errMsg}</span>
        </div>
      )}

      {status === 'ready' && data && (
        data.activeImport === null || data.segments.length === 0 ? (
          <p className="text-xs text-htg-fg-muted">
            Brak transkrypcji dla tej sesji. Lane mówców i tekst pojawią się po
            wgraniu importu (manual / LiveKit Faza 2 / diarization).
          </p>
        ) : (
          <div className="space-y-3">
            <SpeakerLane
              segments={data.segments}
              speakers={data.speakers}
              durationSec={durationSec}
              currentSec={currentSec}
              onSeek={onSeek}
            />
            <TranscriptSegmentList
              segments={data.segments}
              currentSec={currentSec}
              onSeek={onSeek}
            />
          </div>
        )
      )}
    </div>
  );
}
