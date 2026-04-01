'use client';

import { useState, useRef, useEffect } from 'react';
import { Info, UserPlus, X } from 'lucide-react';
import { assignRecordingAccess, removeRecordingAccess } from './actions';

interface Participant {
  user_id: string;
  display_name: string | null;
  email: string | null;
  revoked: boolean;
}

interface Details {
  status: string;
  source: string;
  import_confidence: string | null;
  duration_seconds: number | null;
  legal_hold: boolean | null;
}

interface Props {
  recordingId: string;
  sourceEmail: string | null;
  participants: Participant[];
  details: Details;
}

const statusLabels: Record<string, string> = {
  ready: 'Gotowe', processing: 'Przetwarzane', uploading: 'Wysyłane',
  preparing: 'Przygotowywane', queued: 'W kolejce', failed: 'Nieudane',
  expired: 'Wygasłe', ignored: 'Zignorowane',
};

export default function RecordingActions({ recordingId, sourceEmail, participants, details }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [assignEmail, setAssignEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const assignRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) setShowDetails(false);
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setShowAssign(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleAssign() {
    if (!assignEmail.trim()) return;
    setBusy(true);
    setMessage(null);
    const result = await assignRecordingAccess(recordingId, assignEmail.trim());
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
    } else {
      setMessage(`Przydzielono: ${result.displayName ?? assignEmail}`);
      setAssignEmail('');
      setTimeout(() => window.location.reload(), 1000);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm('Usunąć przydział tego nagrania?')) return;
    setBusy(true);
    const result = await removeRecordingAccess(recordingId, userId);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
    } else {
      setTimeout(() => window.location.reload(), 500);
    }
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      {/* Details tooltip */}
      <div className="relative" ref={detailsRef}>
        <button
          onClick={() => { setShowDetails(!showDetails); setShowAssign(false); }}
          className="p-1.5 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg"
          title="Szczegóły"
        >
          <Info className="w-4 h-4" />
        </button>

        {showDetails && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-htg-card border border-htg-card-border rounded-xl shadow-lg z-50 p-4 text-xs">
            <div className="space-y-2">
              <Row label="Status" value={statusLabels[details.status] ?? details.status} />
              <Row label="Źródło" value={details.source === 'live' ? 'Live' : 'Import'} />
              {details.import_confidence ? (
                <Row label="Confidence" value={details.import_confidence} />
              ) : null}
              <Row
                label="Czas"
                value={details.duration_seconds
                  ? `${Math.floor(details.duration_seconds / 60)} min`
                  : '—'
                }
              />
              {details.legal_hold ? (
                <Row label="Legal hold" value="Tak" />
              ) : null}
              {sourceEmail ? (
                <Row label="Email z pliku" value={sourceEmail} />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Assign button */}
      <div className="relative" ref={assignRef}>
        <button
          onClick={() => { setShowAssign(!showAssign); setShowDetails(false); setMessage(null); }}
          className="p-1.5 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg"
          title="Przydziel / zmień"
        >
          <UserPlus className="w-4 h-4" />
        </button>

        {showAssign && (
          <div className="absolute right-0 top-full mt-1 w-80 bg-htg-card border border-htg-card-border rounded-xl shadow-lg z-50 p-4">
            <p className="text-xs font-medium text-htg-fg mb-3">Przydziel nagranie</p>

            {/* Current participants */}
            {participants.length > 0 && (
              <div className="mb-3 space-y-1">
                <p className="text-[10px] text-htg-fg-muted uppercase tracking-wider">Obecny przydział:</p>
                {participants.map((p) => (
                  <div key={p.user_id} className="flex items-center justify-between bg-htg-surface rounded-lg px-2 py-1.5">
                    <span className={`text-xs ${p.revoked ? 'line-through text-htg-fg-muted' : 'text-htg-fg'}`}>
                      {p.display_name ?? p.email ?? '—'}
                    </span>
                    {!p.revoked ? (
                      <button
                        onClick={() => handleRemove(p.user_id)}
                        disabled={busy}
                        className="text-red-400 hover:text-red-300 p-0.5"
                        title="Usuń przydział"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {/* Add new */}
            <div className="flex gap-2">
              <input
                type="email"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                placeholder="Email użytkownika..."
                className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-2 py-1.5 text-xs text-htg-fg"
                onKeyDown={(e) => e.key === 'Enter' && handleAssign()}
              />
              <button
                onClick={handleAssign}
                disabled={busy || !assignEmail.trim()}
                className="bg-htg-sage text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-htg-sage/90 disabled:opacity-50 transition-colors"
              >
                {busy ? '...' : 'Dodaj'}
              </button>
            </div>

            {message ? (
              <p className={`text-xs mt-2 ${message.startsWith('Przydzielono') ? 'text-green-400' : 'text-red-400'}`}>
                {message}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-htg-fg-muted">{label}</span>
      <span className="text-htg-fg font-medium">{value}</span>
    </div>
  );
}
