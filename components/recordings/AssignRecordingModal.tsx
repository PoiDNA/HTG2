'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, UserCheck, Loader2, UserPlus } from 'lucide-react';
import {
  assignRecordingForActor,
  bulkAssignRecordingForActor,
  removeRecordingAccessForActor,
  type AssignResult,
  type PerEmailResult,
} from '@/lib/recordings/assign-for-actor';
import { PRESET_SHARE_EMAILS } from '@/lib/recordings/preset-share-list';

interface Participant {
  user_id: string;
  email: string | null;
  display_name: string | null;
  revoked: boolean;
  granted_reason: string;
}

interface UserSuggestion {
  id: string;
  email: string;
  display_name: string | null;
}

interface Props {
  recordingId: string;
  onClose: () => void;
  onFinalChange: () => void;
}

const statusLabel: Record<AssignResult['status'], string> = {
  added: 'Dodano',
  already_had: 'Już ma dostęp',
  regranted: 'Ponownie przydzielono',
  user_not_found: 'Nie znaleziono',
  scope_violation: 'Brak uprawnień',
  unauthorized: 'Brak uprawnień',
  invalid_recording: 'Nagranie niedostępne',
  error: 'Błąd',
};

export default function AssignRecordingModal({ recordingId, onClose, onFinalChange }: Props) {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'error' | 'info' } | null>(null);

  // Preset checkboxes
  const [selectedPreset, setSelectedPreset] = useState<Set<string>>(new Set());
  const [bulkResults, setBulkResults] = useState<PerEmailResult[] | null>(null);

  // Manual autocomplete
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchParticipants = useCallback(async () => {
    setLoadingParticipants(true);
    try {
      const res = await fetch(`/api/recordings/participants?id=${encodeURIComponent(recordingId)}`);
      if (!res.ok) {
        setParticipants([]);
        setMessage({ text: 'Nie udało się pobrać listy uczestników', kind: 'error' });
        return;
      }
      const data = await res.json();
      setParticipants(data.participants || []);
    } catch {
      setParticipants([]);
      setMessage({ text: 'Błąd sieci', kind: 'error' });
    } finally {
      setLoadingParticipants(false);
    }
  }, [recordingId]);

  useEffect(() => {
    fetchParticipants();
  }, [fetchParticipants]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChanges]);

  function handleClose() {
    if (hasChanges) onFinalChange();
    onClose();
  }

  function fetchSuggestions(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          const results = Array.isArray(data) ? data : [];
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 250);
  }

  function onQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    fetchSuggestions(v);
  }

  function selectSuggestion(s: UserSuggestion) {
    setQuery(s.email);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function handleAssignManual() {
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    setShowSuggestions(false);

    try {
      const result = await assignRecordingForActor(recordingId, query.trim());
      switch (result.status) {
        case 'added':
          setMessage({ text: `Przydzielono: ${result.displayName}`, kind: 'success' });
          setQuery('');
          setHasChanges(true);
          await fetchParticipants();
          break;
        case 'regranted':
          setMessage({ text: `Ponownie przydzielono: ${result.displayName}`, kind: 'success' });
          setQuery('');
          setHasChanges(true);
          await fetchParticipants();
          break;
        case 'already_had':
          setMessage({ text: `Użytkownik już ma dostęp: ${result.displayName}`, kind: 'info' });
          break;
        case 'user_not_found':
          setMessage({ text: `Nie znaleziono użytkownika: ${result.email}`, kind: 'error' });
          break;
        case 'scope_violation':
          setMessage({ text: 'Brak uprawnień do tego typu sesji', kind: 'error' });
          break;
        case 'unauthorized':
          setMessage({ text: 'Sesja wygasła — zaloguj się ponownie', kind: 'error' });
          break;
        case 'invalid_recording':
          setMessage({ text: 'Nagranie nie jest dostępne do przydzielenia', kind: 'error' });
          break;
        case 'error':
          setMessage({ text: `Błąd: ${result.error}`, kind: 'error' });
          break;
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkAssign() {
    const emails = Array.from(selectedPreset);
    if (emails.length === 0) return;
    setBusy(true);
    setMessage(null);
    setBulkResults(null);

    try {
      const { results, status } = await bulkAssignRecordingForActor(recordingId, emails);
      if (status === 'unauthorized') {
        setMessage({ text: 'Sesja wygasła', kind: 'error' });
        return;
      }
      if (status === 'scope_violation') {
        setMessage({ text: 'Brak uprawnień do tego typu sesji', kind: 'error' });
        return;
      }
      if (status === 'invalid_recording') {
        setMessage({ text: 'Nagranie nie jest dostępne do przydzielenia', kind: 'error' });
        return;
      }

      setBulkResults(results);
      const anyChange = results.some(r => r.status === 'added' || r.status === 'regranted');
      if (anyChange) {
        setHasChanges(true);
        await fetchParticipants();
      }
      setSelectedPreset(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(participant: Participant) {
    const label = participant.display_name ?? participant.email ?? 'tego użytkownika';
    if (!confirm(`Usunąć przydział tego nagrania dla ${label}?`)) return;
    setBusy(true);
    setMessage(null);

    try {
      const result = await removeRecordingAccessForActor(recordingId, participant.user_id);
      if (result.error) {
        setMessage({ text: `Błąd: ${result.error}`, kind: 'error' });
        return;
      }
      if (result.status === 'unauthorized') {
        setMessage({ text: 'Sesja wygasła', kind: 'error' });
        return;
      }
      if (result.status === 'scope_violation') {
        setMessage({ text: 'Brak uprawnień', kind: 'error' });
        return;
      }
      if (result.status === 'invalid_recording') {
        setMessage({ text: 'Nagranie niedostępne', kind: 'error' });
        return;
      }
      setMessage({ text: `Usunięto dostęp: ${label}`, kind: 'success' });
      setHasChanges(true);
      await fetchParticipants();
    } finally {
      setBusy(false);
    }
  }

  function togglePreset(email: string) {
    setSelectedPreset(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  const activeParticipants = (participants || []).filter(p => !p.revoked);
  const revokedParticipants = (participants || []).filter(p => p.revoked);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-htg-card border border-htg-card-border rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between p-5 border-b border-htg-card-border bg-htg-card">
          <h2 className="text-lg font-serif font-bold text-htg-fg flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-htg-indigo" />
            Przydziel nagranie
          </h2>
          <button
            onClick={handleClose}
            className="text-htg-fg-muted hover:text-htg-fg p-1"
            title="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Obecny przydział */}
          <section>
            <p className="text-[10px] text-htg-fg-muted uppercase tracking-wider mb-2">
              Obecny przydział
            </p>
            {loadingParticipants ? (
              <div className="flex items-center gap-2 text-htg-fg-muted text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Ładowanie...
              </div>
            ) : activeParticipants.length === 0 && revokedParticipants.length === 0 ? (
              <p className="text-xs text-htg-fg-muted italic">Brak uczestników</p>
            ) : (
              <div className="space-y-1">
                {activeParticipants.map(p => (
                  <div
                    key={p.user_id}
                    className="flex items-center justify-between bg-htg-surface rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-htg-fg truncate">
                        {p.display_name ?? p.email ?? '—'}
                      </div>
                      {p.display_name && p.email && (
                        <div className="text-[10px] text-htg-fg-muted truncate">{p.email}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(p)}
                      disabled={busy}
                      className="text-red-400 hover:text-red-300 p-1 disabled:opacity-40"
                      title="Usuń przydział"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {revokedParticipants.map(p => (
                  <div
                    key={p.user_id}
                    className="flex items-center bg-htg-surface/50 rounded-lg px-3 py-2 opacity-60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-htg-fg-muted line-through truncate">
                        {p.display_name ?? p.email ?? '—'}
                      </div>
                      <div className="text-[10px] text-htg-fg-muted">Dostęp cofnięty</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Preset share */}
          <section>
            <p className="text-[10px] text-htg-fg-muted uppercase tracking-wider mb-2">
              Udostępnij też stałym osobom
            </p>
            <div className="space-y-1.5">
              {PRESET_SHARE_EMAILS.map(email => (
                <label
                  key={email}
                  className="flex items-center gap-2 text-sm text-htg-fg cursor-pointer hover:bg-htg-surface/50 rounded px-2 py-1 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedPreset.has(email)}
                    onChange={() => togglePreset(email)}
                    disabled={busy}
                    className="accent-htg-sage"
                  />
                  <span className="truncate">{email}</span>
                </label>
              ))}
            </div>
            <button
              onClick={handleBulkAssign}
              disabled={busy || selectedPreset.size === 0}
              className="w-full mt-3 py-2 rounded-lg bg-htg-indigo text-white text-sm font-medium hover:bg-htg-indigo/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Dodaj zaznaczonych ({selectedPreset.size})
            </button>

            {bulkResults && (
              <div className="mt-3 p-3 bg-htg-surface rounded-lg text-xs space-y-1">
                <div className="text-htg-fg font-medium">
                  {(() => {
                    const counts = {
                      added: bulkResults.filter(r => r.status === 'added' || r.status === 'regranted').length,
                      already: bulkResults.filter(r => r.status === 'already_had').length,
                      notFound: bulkResults.filter(r => r.status === 'user_not_found').length,
                      errors: bulkResults.filter(r => r.status === 'error' || r.status === 'scope_violation').length,
                    };
                    return `Dodano: ${counts.added} | Już mieli: ${counts.already} | Brak konta: ${counts.notFound} | Błąd: ${counts.errors}`;
                  })()}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-htg-fg-muted hover:text-htg-fg">
                    Szczegóły
                  </summary>
                  <div className="mt-2 space-y-1">
                    {bulkResults.map(r => (
                      <div key={r.email} className="flex justify-between text-[11px]">
                        <span className="text-htg-fg truncate mr-2">{r.email}</span>
                        <span className="text-htg-fg-muted shrink-0">{statusLabel[r.status]}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </section>

          {/* Manual assign */}
          <section>
            <p className="text-[10px] text-htg-fg-muted uppercase tracking-wider mb-2">
              Dodaj pojedynczo
            </p>
            <div className="relative">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={onQueryChange}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Email lub imię..."
                  autoComplete="off"
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAssignManual();
                    }
                    if (e.key === 'Escape') setShowSuggestions(false);
                  }}
                  className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg placeholder-htg-fg-muted focus:outline-none focus:ring-2 focus:ring-htg-sage/30"
                />
                {loadingSuggestions && (
                  <Loader2 className="absolute right-[5.5rem] top-2.5 w-4 h-4 animate-spin text-htg-fg-muted" />
                )}
                <button
                  onClick={handleAssignManual}
                  disabled={busy || !query.trim()}
                  className="shrink-0 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Dodaj
                </button>
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-[5rem] top-full mt-1 bg-htg-card border border-htg-card-border rounded-lg shadow-xl overflow-hidden z-10">
                  {suggestions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        selectSuggestion(s);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-htg-surface transition-colors flex flex-col gap-0.5"
                    >
                      <span className="text-sm text-htg-fg truncate">{s.email}</span>
                      {s.display_name && (
                        <span className="text-[10px] text-htg-fg-muted truncate">{s.display_name}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Message */}
          {message && (
            <div
              className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
                message.kind === 'success'
                  ? 'bg-green-900/20 text-green-400'
                  : message.kind === 'info'
                  ? 'bg-blue-900/20 text-blue-400'
                  : 'bg-red-900/20 text-red-400'
              }`}
            >
              {message.kind === 'success' && <UserCheck className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{message.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
