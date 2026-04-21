'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Loader2, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import SpeakerLane from './SpeakerLane';
import TranscriptSegmentList from '@/components/transcript/TranscriptSegmentList';
import type { SpeakersResponse } from '@/lib/speakers/client';

const SOURCE_LABEL: Record<NonNullable<SpeakersResponse['activeImport']>['source'], string> = {
  manual: 'ręczny seed',
  livekit_phase2_pertrack: 'LiveKit per-track',
  livekit_phase2_diarize: 'diarization',
  archival_diarize: 'archival diarize (OpenAI)',
  fireflies_diarize: 'Fireflies.ai',
};

type EditLocale = 'pl' | 'en' | 'de' | 'pt';

interface Props {
  sessionId: string;
  durationSec: number;
  currentSec: number;
  onSeek: (sec: number) => void;
  onData?: (data: SpeakersResponse) => void;
  /** Bieżący tryb edycji locale. Domyślnie 'pl' (oryginał). */
  locale?: EditLocale;
}

export default function SpeakersPanel({
  sessionId, durationSec, currentSec, onSeek, onData, locale = 'pl',
}: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [data, setData] = useState<SpeakersResponse | null>(null);
  const [diarizing, setDiarizing] = useState(false);
  const [diarizeMsg, setDiarizeMsg] = useState<string | null>(null);
  const [bumping, setBumping] = useState(false);
  const [bumpMsg, setBumpMsg] = useState<string | null>(null);
  const [ffStatus, setFfStatus] = useState<null | 'uploading' | 'pending' | 'checking' | 'error'>(null);
  const [ffMsg, setFfMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrMsg(null);
    try {
      const res = await fetch(`/api/admin/fragments/sessions/${sessionId}/speakers`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as SpeakersResponse;
      setData(json);
      setStatus('ready');
      onData?.(json);
    } catch (e) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : 'Błąd');
    }
  }, [sessionId, onData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => { cancelled = true; };
  }, [load]);

  const runDiarize = useCallback(async () => {
    if (!confirm('Wygenerować transkrypcję dla tej sesji? Proces może potrwać kilka minut.')) return;
    setDiarizing(true);
    setDiarizeMsg(null);
    try {
      const res = await fetch(
        `/api/admin/fragments/sessions/${sessionId}/speaker-imports/diarize`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setDiarizeMsg(
        `Gotowe: ${json.segmentsInserted} segmentów, ${json.rawSpeakerCount} mówców (${(json.elapsedMs / 1000).toFixed(1)}s)`,
      );
      await load();
    } catch (e) {
      setDiarizeMsg(e instanceof Error ? e.message : 'Błąd diarize');
    } finally {
      setDiarizing(false);
    }
  }, [sessionId, load]);

  const renameSpeaker = useCallback(async (speakerKey: string, displayName: string | null) => {
    const res = await fetch(
      `/api/admin/fragments/sessions/${sessionId}/speakers/${encodeURIComponent(speakerKey)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    await load();
  }, [sessionId, load]);

  const editSegment = useCallback(async (segmentId: string, text: string | null, editLocale: EditLocale) => {
    const payload: { text: string | null; locale?: string } = { text };
    if (editLocale !== 'pl') payload.locale = editLocale;
    const res = await fetch(
      `/api/admin/fragments/sessions/${sessionId}/segments/${segmentId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    await load();
  }, [sessionId, load]);

  const reassignSpeaker = useCallback(async (segmentId: string, speakerKey: string) => {
    const res = await fetch(
      `/api/admin/fragments/sessions/${sessionId}/segments/${segmentId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakerKey }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    await load();
  }, [sessionId, load]);

  const runFireflies = useCallback(async () => {
    setFfStatus('uploading');
    setFfMsg(null);
    try {
      const res = await fetch(
        `/api/admin/fragments/sessions/${sessionId}/speaker-imports/diarize-fireflies`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setFfStatus('pending');
      setFfMsg('Przesłano. Fireflies przetwarza (5-20 min). Kliknij "Sprawdź" za chwilę.');
    } catch (e) {
      setFfStatus('error');
      setFfMsg(e instanceof Error ? e.message : 'Błąd');
    }
  }, [sessionId]);

  const pollFireflies = useCallback(async () => {
    setFfStatus('checking');
    try {
      const res = await fetch(
        `/api/admin/fragments/sessions/${sessionId}/speaker-imports/diarize-fireflies/poll`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.status === 'done') {
        setFfStatus(null);
        setFfMsg(null);
        await load();
      } else {
        setFfStatus('pending');
        setFfMsg(json.message ?? 'Jeszcze przetwarza…');
      }
    } catch (e) {
      setFfStatus('error');
      setFfMsg(e instanceof Error ? e.message : 'Błąd poll');
    }
  }, [sessionId, load]);

  const bumpMediaVersion = useCallback(async () => {
    if (!confirm('Podmieniłeś plik audio w Bunny Storage? Ta operacja wymusi odświeżenie cache (CDN), wyczyści peaks i dezaktywuje transkrypcję.')) return;
    setBumping(true);
    setBumpMsg(null);
    try {
      const res = await fetch(
        `/api/admin/fragments/sessions/${sessionId}/bump-media-version`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBumpMsg(`Cache odświeżony (v=${json.mediaVersion}). Przeładuj stronę.`);
      await load();
    } catch (e) {
      setBumpMsg(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBumping(false);
    }
  }, [sessionId, load]);

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
        <button
          type="button"
          onClick={bumpMediaVersion}
          disabled={bumping}
          title="Odśwież cache CDN po podmianie pliku w Bunny Storage"
          className={`inline-flex items-center gap-1 text-[11px] text-htg-fg-muted hover:text-htg-fg transition-colors disabled:opacity-50 ${data?.activeImport ? '' : 'ml-auto'}`}
        >
          {bumping ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Odśwież audio
        </button>
      </div>

      {bumpMsg && (
        <p className={`text-[11px] ${bumpMsg.startsWith('Cache') ? 'text-htg-sage' : 'text-red-400'}`}>
          {bumpMsg}
        </p>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errMsg}</span>
        </div>
      )}

      {status === 'ready' && data && (
        data.activeImport === null || data.segments.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-htg-fg-muted">
              Brak transkrypcji dla tej sesji.
            </p>

            {/* Fireflies flow — domyślny */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runFireflies}
                disabled={ffStatus === 'uploading' || ffStatus === 'checking'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {ffStatus === 'uploading'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                {ffStatus === 'uploading' ? 'Przesyłam do Fireflies…' : 'Wczytaj transkrypcję (Fireflies)'}
              </button>

              {ffStatus === 'pending' && (
                <button
                  type="button"
                  onClick={pollFireflies}
                  disabled={ffStatus !== 'pending'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Sprawdź gotowość
                </button>
              )}

              {ffStatus === 'checking' && (
                <span className="inline-flex items-center gap-1 text-xs text-htg-fg-muted">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Sprawdzam…
                </span>
              )}
            </div>

            {ffMsg && (
              <p className={`text-[11px] ${ffStatus === 'error' ? 'text-red-400' : 'text-htg-fg-muted'}`}>
                {ffMsg}
              </p>
            )}

            {/* Fallback OpenAI */}
            <div className="pt-1">
              <button
                type="button"
                onClick={runDiarize}
                disabled={diarizing}
                className="inline-flex items-center gap-1 text-[11px] text-htg-fg-muted hover:text-htg-fg transition-colors disabled:opacity-50"
              >
                {diarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {diarizing ? 'Generowanie…' : 'Fallback (OpenAI)'}
              </button>
              {diarizeMsg && (
                <p className={`text-[11px] ${diarizeMsg.startsWith('Gotowe') ? 'text-htg-sage' : 'text-red-400'}`}>
                  {diarizeMsg}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <SpeakerLane
              segments={data.segments}
              speakers={data.speakers}
              durationSec={durationSec}
              currentSec={currentSec}
              onSeek={onSeek}
              onRenameSpeaker={renameSpeaker}
            />
            <TranscriptSegmentList
              segments={data.segments}
              currentSec={currentSec}
              onSeek={onSeek}
              onEditSegment={editSegment}
              onReassignSpeaker={reassignSpeaker}
              speakers={data.speakers}
              locale={locale}
            />
          </div>
        )
      )}
    </div>
  );
}
