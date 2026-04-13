'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n-config';

interface MeetingFormProps {
  locale: string;
  basePath?: string;
  initial?: {
    name?: string;
    meeting_type?: string;
    max_participants?: number;
    allow_self_register?: boolean;
    participant_selection?: string;
  };
  meetingId?: string;
}

export default function MeetingForm({ locale, initial, meetingId, basePath = '/prowadzacy/spotkania-htg' }: MeetingFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [meetingType, setMeetingType] = useState(initial?.meeting_type ?? 'group');
  const [maxParticipants, setMaxParticipants] = useState(initial?.max_participants ?? 12);
  const [allowSelfRegister, setAllowSelfRegister] = useState(initial?.allow_self_register ?? true);
  const [participantSelection, setParticipantSelection] = useState(initial?.participant_selection ?? 'lottery');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Podaj nazwę spotkania'); return; }
    setLoading(true);
    setError('');
    try {
      const isEdit = !!meetingId;
      const res = await fetch(isEdit ? `/api/htg-meeting/${meetingId}` : '/api/htg-meeting', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          meeting_type: meetingType,
          max_participants: maxParticipants,
          allow_self_register: allowSelfRegister,
          participant_selection: participantSelection,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Błąd'); return; }
      router.push({pathname: '/prowadzacy/spotkania-htg/[meetingId]', params: {meetingId: data.id ?? meetingId}} as any);
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {/* Basic info */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-htg-fg">Podstawowe informacje</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-htg-fg-muted mb-1 block">Nazwa spotkania</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="np. Spotkanie integracyjne HTG"
              className="w-full px-3 py-2.5 rounded-xl bg-htg-surface border border-htg-card-border text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
            />
          </div>
          <div>
            <label className="text-xs text-htg-fg-muted mb-1 block">Typ spotkania</label>
            <input
              type="text"
              value={meetingType}
              onChange={e => setMeetingType(e.target.value)}
              placeholder="np. group, workshop, panel"
              className="w-full px-3 py-2.5 rounded-xl bg-htg-surface border border-htg-card-border text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
            />
          </div>
          <div>
            <label className="text-xs text-htg-fg-muted mb-1 block">Max liczba uczestników</label>
            <input
              type="number"
              value={maxParticipants}
              onChange={e => setMaxParticipants(Number(e.target.value))}
              min={2}
              max={50}
              className="w-full px-3 py-2.5 rounded-xl bg-htg-surface border border-htg-card-border text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
            />
          </div>
        </div>
      </div>

      {/* Participation settings */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-htg-fg">Ustawienia uczestnictwa</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={allowSelfRegister}
            onChange={e => setAllowSelfRegister(e.target.checked)}
            className="w-4 h-4 rounded accent-htg-sage"
          />
          <div>
            <p className="text-sm text-htg-fg">Osoby mogą zgłaszać się samodzielnie</p>
            <p className="text-xs text-htg-fg-muted">Użytkownicy HTG mogą zapisać się na spotkanie sami</p>
          </div>
        </label>

        <div>
          <p className="text-sm text-htg-fg mb-2">Dobór uczestników</p>
          <div className="space-y-2">
            {(['lottery', 'admin'] as const).map(v => (
              <label key={v} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  value={v}
                  checked={participantSelection === v}
                  onChange={() => setParticipantSelection(v)}
                  className="accent-htg-sage"
                />
                <div>
                  <p className="text-sm text-htg-fg">
                    {v === 'lottery' ? 'Losowanie spośród zgłoszonych' : 'Dobór przez admina'}
                  </p>
                  <p className="text-xs text-htg-fg-muted">
                    {v === 'lottery'
                      ? 'System losuje uczestników z listy zgłoszeń'
                      : 'Admin ręcznie zatwierdza uczestników'}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2.5 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 disabled:opacity-40 transition-colors"
      >
        {loading ? 'Zapisuję...' : meetingId ? 'Zapisz zmiany' : 'Utwórz spotkanie'}
      </button>
    </form>
  );
}
