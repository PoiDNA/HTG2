'use client';

import { useState, useCallback } from 'react';
import { AutoEditProgress } from './AutoEditProgress';
import { TranscriptionView } from './TranscriptionView';
import { Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import type { PipelineStage } from '@/lib/auto-edit/types';
import { PIPELINE_STAGES } from '@/lib/auto-edit/types';

interface AutoEditPanelProps {
  publicationId: string;
  hasSourceTracks: boolean;
  initialAutoEditStatus?: string | null;
  labels: {
    title: string;
    start_pipeline: string;
    starting: string;
    resume: string;
    no_source_tracks: string;
    pipeline_done: string;
    pipeline_failed: string;
    approve: string;
    reject: string;
    transcription: string;
    show_transcription: string;
    hide_transcription: string;
    select_stages: string;
    all_stages: string;
    stage_transcribe: string;
    stage_analyze: string;
    stage_clean: string;
    stage_mix: string;
    stage_master: string;
    status_pending: string;
    status_processing: string;
    status_done: string;
    status_failed: string;
    loading: string;
    no_transcription: string;
    action_remove: string;
    action_shorten: string;
    action_keep: string;
    legend: string;
  };
}

type PanelState = 'idle' | 'running' | 'done' | 'failed';

export function AutoEditPanel({
  publicationId,
  hasSourceTracks,
  initialAutoEditStatus,
  labels,
}: AutoEditPanelProps) {
  const initialStatus = parseInitialStatus(initialAutoEditStatus);
  const [state, setState] = useState<PanelState>(initialStatus);
  const [starting, setStarting] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const [selectedStages, setSelectedStages] = useState<PipelineStage[] | null>(null);
  const [showStageSelect, setShowStageSelect] = useState(false);
  const [masteredUrl, setMasteredUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startPipeline = useCallback(async () => {
    setStarting(true);
    setErrorMsg(null);
    try {
      const body: { publicationId: string; stages?: PipelineStage[] } = { publicationId };
      if (selectedStages && selectedStages.length > 0) {
        body.stages = selectedStages;
      }

      const res = await fetch('/api/publikacja/auto-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setState('running');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [publicationId, selectedStages]);

  const handleComplete = useCallback((url: string) => {
    setState('done');
    setMasteredUrl(url);
  }, []);

  const handleError = useCallback((error: string) => {
    setState('failed');
    setErrorMsg(error);
  }, []);

  const toggleStage = (stage: PipelineStage) => {
    setSelectedStages((prev) => {
      if (!prev) return [stage];
      if (prev.includes(stage)) {
        const next = prev.filter((s) => s !== stage);
        return next.length === 0 ? null : next;
      }
      return [...prev, stage];
    });
  };

  const stageLabels: Record<PipelineStage, string> = {
    transcribe: labels.stage_transcribe,
    analyze: labels.stage_analyze,
    clean: labels.stage_clean,
    mix: labels.stage_mix,
    master: labels.stage_master,
  };

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Wand2 className="w-5 h-5 text-htg-sage" />
        <h3 className="text-lg font-serif font-bold text-htg-fg">{labels.title}</h3>
      </div>

      {!hasSourceTracks && (
        <p className="text-sm text-htg-fg-muted">{labels.no_source_tracks}</p>
      )}

      {hasSourceTracks && (state === 'idle' || state === 'failed') && (
        <div className="space-y-3">
          {/* Stage selector toggle */}
          <button
            type="button"
            onClick={() => setShowStageSelect(!showStageSelect)}
            className="flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
          >
            {showStageSelect ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {labels.select_stages}
          </button>

          {showStageSelect && (
            <div className="flex flex-wrap gap-2">
              {PIPELINE_STAGES.map((stage) => {
                const isSelected = !selectedStages || selectedStages.includes(stage);
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => toggleStage(stage)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      isSelected
                        ? 'bg-htg-sage text-white border-htg-sage'
                        : 'bg-htg-surface text-htg-fg-muted border-htg-card-border hover:border-htg-sage'
                    }`}
                  >
                    {stageLabels[stage]}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedStages(null)}
                className="px-3 py-1 text-xs text-htg-fg-muted hover:text-htg-fg transition-colors"
              >
                {labels.all_stages}
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            onClick={startPipeline}
            disabled={starting}
            className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white text-sm font-medium rounded-lg hover:bg-htg-sage/90 disabled:opacity-50 transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            {starting
              ? labels.starting
              : state === 'failed'
                ? labels.resume
                : labels.start_pipeline}
          </button>
        </div>
      )}

      {/* Progress indicator */}
      {(state === 'running' || state === 'done' || state === 'failed') && (
        <AutoEditProgress
          publicationId={publicationId}
          polling={state === 'running'}
          onComplete={handleComplete}
          onError={handleError}
          labels={{
            stage_transcribe: labels.stage_transcribe,
            stage_analyze: labels.stage_analyze,
            stage_clean: labels.stage_clean,
            stage_mix: labels.stage_mix,
            stage_master: labels.stage_master,
            status_pending: labels.status_pending,
            status_processing: labels.status_processing,
            status_done: labels.status_done,
            status_failed: labels.status_failed,
          }}
        />
      )}

      {/* Done state — approve/reject */}
      {state === 'done' && masteredUrl && (
        <div className="space-y-3">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {labels.pipeline_done}
          </div>

          <audio controls src={masteredUrl} className="w-full" />

          <div className="flex gap-3">
            <button
              type="button"
              className="px-4 py-2 bg-htg-sage text-white text-sm font-medium rounded-lg hover:bg-htg-sage/90 transition-colors"
            >
              {labels.approve}
            </button>
            <button
              type="button"
              onClick={() => setState('idle')}
              className="px-4 py-2 bg-htg-surface text-htg-fg text-sm font-medium rounded-lg border border-htg-card-border hover:bg-htg-surface/80 transition-colors"
            >
              {labels.reject}
            </button>
          </div>
        </div>
      )}

      {/* Transcription view toggle */}
      {(state === 'done' || state === 'running') && (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscription(!showTranscription)}
            className="flex items-center gap-1.5 text-sm text-htg-sage hover:text-htg-sage/80 transition-colors"
          >
            {showTranscription ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {showTranscription ? labels.hide_transcription : labels.show_transcription}
          </button>

          {showTranscription && (
            <div className="mt-3">
              <TranscriptionView
                publicationId={publicationId}
                labels={{
                  loading: labels.loading,
                  no_transcription: labels.no_transcription,
                  action_remove: labels.action_remove,
                  action_shorten: labels.action_shorten,
                  action_keep: labels.action_keep,
                  legend: labels.legend,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseInitialStatus(raw: string | null | undefined): PanelState {
  if (!raw) return 'idle';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed.status === 'processing') return 'running';
    if (parsed.status === 'done') return 'done';
    if (parsed.status === 'failed') return 'failed';
    return 'idle';
  } catch {
    return 'idle';
  }
}
