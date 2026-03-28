'use client';

import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';

interface ParticipantApprovalProps {
  participantId: string;
  sessionId: string;
  displayName: string;
  email?: string | null;
}

export default function ParticipantApproval({
  participantId,
  sessionId,
  displayName,
  email,
}: ParticipantApprovalProps) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'loading'>('pending');

  const act = async (action: 'approve' | 'reject') => {
    setStatus('loading');
    const res = await fetch(`/api/htg-meeting/session/${sessionId}/approve-participant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId, action }),
    });
    if (res.ok) {
      setStatus(action === 'approve' ? 'approved' : 'rejected');
    } else {
      setStatus('pending');
    }
  };

  if (status === 'approved') {
    return (
      <div className="flex items-center gap-2 text-xs text-htg-sage">
        <Check className="w-3.5 h-3.5" />
        <span>{displayName} — zatwierdzono</span>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="flex items-center gap-2 text-xs text-htg-fg-muted/50 line-through">
        <span>{displayName} — odrzucono</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-htg-surface px-3 py-2">
      <div className="min-w-0">
        <span className="text-sm font-medium text-htg-fg truncate block">{displayName}</span>
        {email && <span className="text-xs text-htg-fg-muted">{email}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin text-htg-fg-muted" />
        ) : (
          <>
            <button
              onClick={() => act('approve')}
              title="Zatwierdź"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-htg-sage/15 hover:bg-htg-sage/30 text-htg-sage transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => act('reject')}
              title="Odrzuć"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
