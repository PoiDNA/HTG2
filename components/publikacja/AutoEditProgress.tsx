'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PipelineProgressResponse, PipelineStage, StageStatus } from '@/lib/auto-edit/types';
import { PIPELINE_STAGES } from '@/lib/auto-edit/types';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';

interface AutoEditProgressProps {
  publicationId: string;
  polling: boolean;
  onComplete?: (masteredUrl: string) => void;
  onError?: (error: string) => void;
  labels: {
    stage_transcribe: string;
    stage_analyze: string;
    stage_clean: string;
    stage_mix: string;
    stage_master: string;
    status_pending: string;
    status_processing: string;
    status_done: string;
    status_failed: string;
  };
}

const POLL_INTERVAL = 3000;

export function AutoEditProgress({
  publicationId,
  polling,
  onComplete,
  onError,
  labels,
}: AutoEditProgressProps) {
  const [progress, setProgress] = useState<PipelineProgressResponse | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/publikacja/auto-edit/status?publicationId=${publicationId}`
      );
      if (!res.ok) return;
      const data: PipelineProgressResponse = await res.json();
      setProgress(data);

      if (data.status === 'done' && data.masteredUrl) {
        onComplete?.(data.masteredUrl);
      }
      if (data.status === 'failed') {
        const failedStage = Object.entries(data.stages).find(
          ([, s]) => s.status === 'failed'
        );
        onError?.(failedStage?.[1]?.error || 'Pipeline failed');
      }
    } catch {
      // Silently ignore fetch errors during polling
    }
  }, [publicationId, onComplete, onError]);

  useEffect(() => {
    fetchStatus();

    if (!polling) return;

    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [polling, fetchStatus]);

  if (!progress) return null;

  const stageLabels: Record<PipelineStage, string> = {
    transcribe: labels.stage_transcribe,
    analyze: labels.stage_analyze,
    clean: labels.stage_clean,
    mix: labels.stage_mix,
    master: labels.stage_master,
  };

  return (
    <div className="space-y-3">
      {PIPELINE_STAGES.map((stage) => {
        const stageInfo = progress.stages[stage];
        return (
          <div key={stage} className="flex items-center gap-3">
            <StageIcon status={stageInfo.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm font-medium ${
                    stageInfo.status === 'processing'
                      ? 'text-htg-sage'
                      : stageInfo.status === 'done'
                        ? 'text-htg-fg'
                        : stageInfo.status === 'failed'
                          ? 'text-red-500'
                          : 'text-htg-fg-muted'
                  }`}
                >
                  {stageLabels[stage]}
                </span>
                <span className="text-xs text-htg-fg-muted">
                  {stageInfo.status === 'processing' && stageInfo.progress != null
                    ? `${Math.round(stageInfo.progress * 100)}%`
                    : ''}
                </span>
              </div>
              {stageInfo.status === 'processing' && (
                <div className="mt-1 h-1.5 bg-htg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-htg-sage rounded-full transition-all duration-500"
                    style={{ width: `${(stageInfo.progress || 0) * 100}%` }}
                  />
                </div>
              )}
              {stageInfo.status === 'failed' && stageInfo.error && (
                <p className="text-xs text-red-500 mt-0.5 truncate">{stageInfo.error}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />;
    case 'processing':
      return <Loader2 className="w-5 h-5 text-htg-sage flex-shrink-0 animate-spin" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
    default:
      return <Circle className="w-5 h-5 text-htg-fg-muted/30 flex-shrink-0" />;
  }
}
