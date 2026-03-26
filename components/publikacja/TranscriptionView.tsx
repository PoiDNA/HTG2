'use client';

import { useState, useEffect } from 'react';
import type { EditAction } from '@/lib/auto-edit/types';

interface TranscriptionSegment {
  text: string;
  start: number;
  end: number;
  action?: EditAction;
}

interface TranscriptionViewProps {
  publicationId: string;
  labels: {
    loading: string;
    no_transcription: string;
    action_remove: string;
    action_shorten: string;
    action_keep: string;
    legend: string;
  };
}

interface AutoEditData {
  transcriptions?: Array<{
    trackName: string;
    text: string;
    words: Array<{ word: string; start: number; end: number }>;
    duration: number;
  }>;
  editPlan?: {
    actions: EditAction[];
    summary: string;
    estimatedSavedSeconds: number;
  };
}

export function TranscriptionView({ publicationId, labels }: TranscriptionViewProps) {
  const [data, setData] = useState<AutoEditData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/publikacja/sessions/${publicationId}`);
        if (!res.ok) return;
        const json = await res.json();
        const autoEditStatus = json.session?.auto_edit_status;
        if (autoEditStatus) {
          const parsed = typeof autoEditStatus === 'string' ? JSON.parse(autoEditStatus) : autoEditStatus;
          setData(parsed);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [publicationId]);

  if (loading) {
    return <p className="text-sm text-htg-fg-muted">{labels.loading}</p>;
  }

  if (!data?.transcriptions || data.transcriptions.length === 0) {
    return <p className="text-sm text-htg-fg-muted">{labels.no_transcription}</p>;
  }

  const editActions = data.editPlan?.actions || [];

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="font-medium text-htg-fg-muted">{labels.legend}:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          {labels.action_remove}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" />
          {labels.action_shorten}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          {labels.action_keep}
        </span>
      </div>

      {/* Summary */}
      {data.editPlan && (
        <div className="p-3 bg-htg-surface rounded-lg text-sm text-htg-fg">
          <p>{data.editPlan.summary}</p>
          <p className="text-htg-fg-muted mt-1">
            ~{data.editPlan.estimatedSavedSeconds.toFixed(0)}s
          </p>
        </div>
      )}

      {/* Transcription per track */}
      {data.transcriptions.map((track, idx) => (
        <div key={idx}>
          <h4 className="text-sm font-medium text-htg-fg mb-2">
            {track.trackName} ({formatDuration(track.duration)})
          </h4>
          <div className="text-sm leading-relaxed">
            {renderAnnotatedText(track.words, editActions)}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderAnnotatedText(
  words: Array<{ word: string; start: number; end: number }>,
  actions: EditAction[]
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const action = actions.find(
      (a) => w.start >= a.start && w.end <= a.end
    );

    let className = '';
    let title = '';
    if (action) {
      if (action.action === 'remove') {
        className = 'bg-red-100 text-red-800 line-through';
        title = action.reason || 'remove';
      } else if (action.action === 'shorten') {
        className = 'bg-yellow-100 text-yellow-800';
        title = action.reason || 'shorten';
      } else if (action.action === 'keep') {
        className = 'bg-green-50 text-green-800';
        title = action.reason || 'keep';
      }
    }

    elements.push(
      <span
        key={i}
        className={className ? `${className} rounded px-0.5` : undefined}
        title={title || undefined}
      >
        {w.word}{' '}
      </span>
    );
  }

  return elements;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
