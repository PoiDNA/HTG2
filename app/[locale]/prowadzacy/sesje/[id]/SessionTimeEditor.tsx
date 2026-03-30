'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n-config';

interface Props {
  bookingId: string;
  initialTime: string; // "HH:MM"
}

export default function SessionTimeEditor({ bookingId, initialTime }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(initialTime);
  const [savedTime, setSavedTime] = useState(initialTime);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    if (time === savedTime) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/booking/change-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, startTime: time }),
      });
      if (res.ok) {
        setSavedTime(time);
        router.refresh();
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function cancel() {
    setTime(savedTime);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="group flex items-center gap-1.5 text-htg-fg hover:text-htg-warm transition-colors"
        title="Zmień godzinę sesji"
      >
        <span>{savedTime}</span>
        <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onKeyDown={handleKeyDown}
        className="bg-htg-surface border border-htg-card-border rounded px-2 py-0.5 text-sm text-htg-fg w-28 focus:outline-none focus:ring-1 focus:ring-htg-warm"
        disabled={saving}
      />
      {saving ? (
        <Loader2 className="w-4 h-4 animate-spin text-htg-fg-muted" />
      ) : (
        <>
          <button onClick={save} className="text-green-400 hover:text-green-300" title="Zapisz">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={cancel} className="text-red-400 hover:text-red-300" title="Anuluj">
            <X className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
