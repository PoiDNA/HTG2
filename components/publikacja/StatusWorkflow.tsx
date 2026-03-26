'use client';

import { useState } from 'react';
import { ArrowRight, RotateCcw, Loader2 } from 'lucide-react';
import type { PublicationStatus } from '@/lib/publication/types';
import { STATUS_TRANSITIONS } from '@/lib/publication/types';

interface StatusWorkflowProps {
  publicationId: string;
  currentStatus: PublicationStatus;
  isAdmin: boolean;
  onStatusChange: (newStatus: PublicationStatus) => void;
  labels: {
    advance_to: string;
    reset_to: string;
    status_raw: string;
    status_editing: string;
    status_edited: string;
    status_mastering: string;
    status_published: string;
  };
}

const STATUS_LABEL_KEYS: Record<PublicationStatus, keyof StatusWorkflowProps['labels']> = {
  raw: 'status_raw',
  editing: 'status_editing',
  edited: 'status_edited',
  mastering: 'status_mastering',
  published: 'status_published',
};

export function StatusWorkflow({
  publicationId,
  currentStatus,
  isAdmin,
  onStatusChange,
  labels,
}: StatusWorkflowProps) {
  const [loading, setLoading] = useState(false);

  const nextStatus = STATUS_TRANSITIONS[currentStatus];

  const handleAdvance = async () => {
    if (!nextStatus) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/publikacja/sessions/${publicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        onStatusChange(nextStatus);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (targetStatus: PublicationStatus) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/publikacja/sessions/${publicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (res.ok) {
        onStatusChange(targetStatus);
      }
    } finally {
      setLoading(false);
    }
  };

  const allStatuses: PublicationStatus[] = ['raw', 'editing', 'edited', 'mastering', 'published'];
  const currentIndex = allStatuses.indexOf(currentStatus);
  const resetOptions = isAdmin ? allStatuses.slice(0, currentIndex) : [];

  return (
    <div className="space-y-3">
      {/* Advance button */}
      {nextStatus && (
        <button
          onClick={handleAdvance}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white text-sm font-medium rounded-lg hover:bg-htg-sage/90 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
          {labels.advance_to} {labels[STATUS_LABEL_KEYS[nextStatus]]}
        </button>
      )}

      {/* Admin reset options */}
      {resetOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {resetOptions.map((s) => (
            <button
              key={s}
              onClick={() => handleReset(s)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-htg-fg-muted hover:text-htg-fg bg-htg-surface border border-htg-card-border rounded-lg disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {labels.reset_to} {labels[STATUS_LABEL_KEYS[s]]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
