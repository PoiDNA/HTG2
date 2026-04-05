'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

/** Portal-based popover anchored to a button — always on top regardless of table overflow */
function AnchoredPopover({
  anchorRef,
  children,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + window.scrollY + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, [anchorRef]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'absolute', top: pos.top, right: pos.right, zIndex: 9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}

export default function RecordingActions({ recordingId, sourceEmail, participants, details }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [assignEmail, setAssignEmail] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: string; email: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const detailsBtnRef = useRef<HTMLButtonElement>(null);
  const assignBtnRef = useRef<HTMLButtonElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchUsers = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/admin/search-users?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      }
    }, 250);
  }, []);

  async function handleAssign() {
    if (!assignEmail.trim()) return;
    setBusy(true);
    setMessage(null);
    setShowSuggestions(false);
    const result = await assignRecordingAccess(recordingId, assignEmail.trim());
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
    } else {
      setMessage(`Przydzielono: ${result.displayName ?? assignEmail}`);
      setAssignEmail('');
      setSuggestions([]);
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
      {/* Details button */}
      <button
        ref={detailsBtnRef}
        onClick={() => { setShowDetails(!showDetails); setShowAssign(false); }}
        className="p-1.5 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg"
        title="Szczegóły"
      >
        <Info className="w-4 h-4" />
      </button>

      {showDetails && (
        <AnchoredPopover anchorRef={detailsBtnRef} onClose={() => setShowDetails(false)}>
          <div className="w-64 bg-htg-card border border-htg-card-border rounded-xl shadow-xl p-4 text-xs">
            <div className="space-y-2">
              <Row label="Status" value={statusLabels[details.status] ?? details.status} />
              <Row label="Źródło" value={details.source === 'live' ? 'Live' : 'Import'} />
              {details.import_confidence && <Row label="Confidence" value={details.import_confidence} />}
              <Row
                label="Czas"
                value={details.duration_seconds ? `${Math.floor(details.duration_seconds / 60)} min` : '—'}
              />
              {details.legal_hold && <Row label="Legal hold" value="Tak" />}
              {sourceEmail && <Row label="Email z pliku" value={sourceEmail} />}
            </div>
          </div>
        </AnchoredPopover>
      )}

      {/* Assign button */}
      <button
        ref={assignBtnRef}
        onClick={() => { setShowAssign(!showAssign); setShowDetails(false); setMessage(null); }}
        className="p-1.5 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg"
        title="Przydziel / zmień"
      >
        <UserPlus className="w-4 h-4" />
      </button>

      {showAssign && (
        <AnchoredPopover anchorRef={assignBtnRef} onClose={() => { setShowAssign(false); setShowSuggestions(false); }}>
          <div className="w-80 bg-htg-card border border-htg-card-border rounded-xl shadow-xl p-4">
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
                    {!p.revoked && (
                      <button
                        onClick={() => handleRemove(p.user_id)}
                        disabled={busy}
                        className="text-red-400 hover:text-red-300 p-0.5"
                        title="Usuń przydział"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Email input with autocomplete */}
            <div className="relative">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={assignEmail}
                  onChange={(e) => {
                    setAssignEmail(e.target.value);
                    searchUsers(e.target.value);
                  }}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Email użytkownika..."
                  className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-2 py-1.5 text-xs text-htg-fg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAssign();
                    if (e.key === 'Escape') setShowSuggestions(false);
                  }}
                  autoComplete="off"
                />
                <button
                  onClick={handleAssign}
                  disabled={busy || !assignEmail.trim()}
                  className="bg-htg-sage text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-htg-sage/90 disabled:opacity-50 transition-colors"
                >
                  {busy ? '...' : 'Dodaj'}
                </button>
              </div>

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-10 top-full mt-1 bg-htg-card border border-htg-card-border rounded-lg shadow-xl overflow-hidden z-10">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // prevent input blur before click registers
                        setAssignEmail(s.email);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-htg-fg hover:bg-htg-surface transition-colors"
                    >
                      {s.email}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {message && (
              <p className={`text-xs mt-2 ${message.startsWith('Przydzielono') ? 'text-green-400' : 'text-red-400'}`}>
                {message}
              </p>
            )}
          </div>
        </AnchoredPopover>
      )}
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
