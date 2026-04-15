'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserCog, Check, X } from 'lucide-react';

type Operator = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Admin UI: dropdown to reassign operator (assistant) on an existing booking.
 * Calls POST /api/admin/booking/reassign-operator which delegates to the
 * reassign_operator_on_booking RPC (validates availability via
 * check_staff_availability — rules, exceptions, overlapping slots).
 *
 * Visible only for session types that include an operator
 * (natalia_asysta + legacy natalia_agata/natalia_justyna). Does NOT change
 * session_type — use SessionTypeSelector for that.
 */
export default function OperatorReassignSelector({
  bookingId,
  currentAssistantId,
  operators,
}: {
  bookingId: string;
  currentAssistantId: string | null;
  operators: Operator[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(currentAssistantId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function save() {
    if (!selected || selected === currentAssistantId) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/admin/booking/reassign-operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, assistantId: selected }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(translateError(data.error ?? data.message ?? 'Błąd'));
        return;
      }
      setOkMsg('Zapisano');
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e?.message ?? 'Błąd sieci');
    } finally {
      setSaving(false);
    }
  }

  const dirty = selected !== (currentAssistantId ?? '');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-htg-fg">
        <UserCog className="w-4 h-4 text-htg-indigo" />
        <h2 className="text-base font-serif font-bold">Operatorka</h2>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setError(null);
            setOkMsg(null);
          }}
          disabled={saving || isPending}
          className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-indigo/50"
        >
          <option value="">— brak —</option>
          {operators.map((op) => (
            <option key={op.id} value={op.id}>
              {op.name}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={!dirty || !selected || saving || isPending}
          className="flex items-center gap-1 bg-htg-sage text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4" />
          {saving || isPending ? '...' : 'Zapisz'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
          <X className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {okMsg && (
        <div className="flex items-center gap-2 text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{okMsg}</span>
        </div>
      )}

      <p className="text-[11px] text-htg-fg-muted">
        System sprawdzi dostępność wybranej operatorki (reguły + wyjątki + konflikty). Zmienia tylko przypisanie operatorki — nie zmienia typu sesji.
      </p>
    </div>
  );
}

function translateError(code: string): string {
  switch (code) {
    case 'assistant_not_available':
      return 'Operatorka niedostępna w tym terminie (reguły grafiku lub konflikt).';
    case 'assistant_inactive':
      return 'Operatorka nieaktywna.';
    case 'assistant_not_found':
      return 'Operatorka nie znaleziona.';
    case 'booking_not_found':
      return 'Rezerwacja nie znaleziona.';
    case 'slot_not_found':
      return 'Termin nie znaleziony.';
    case 'no_change':
      return 'Bez zmian.';
    default:
      if (code.startsWith('cannot_reassign_status_')) {
        return `Nie można zmienić operatorki dla sesji o statusie: ${code.replace('cannot_reassign_status_', '')}`;
      }
      if (code.startsWith('session_type_has_no_operator_')) {
        return 'Ten typ sesji nie ma operatorki.';
      }
      if (code.startsWith('wrong_role_')) {
        return 'Wybrana osoba nie ma roli operatorki.';
      }
      return code;
  }
}
