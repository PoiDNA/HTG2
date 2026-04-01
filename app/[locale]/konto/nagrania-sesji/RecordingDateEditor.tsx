'use client';

import { useState } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';

interface Props {
  recordingId: string;
  initialDate: string; // "YYYY-MM-DD"
}

export default function RecordingDateEditor({ recordingId, initialDate }: Props) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [savedDate, setSavedDate] = useState(initialDate);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (date === savedDate) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/recording/update-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId, sessionDate: date }),
      });
      if (res.ok) setSavedDate(date);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1 text-htg-fg-muted hover:text-htg-fg transition-colors"
        title="Zmień datę nagrania"
      >
        <span>{new Date(savedDate).toLocaleDateString('pl-PL')}</span>
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDate(savedDate); setEditing(false); } }}
        autoFocus
        className="bg-htg-surface border border-htg-card-border rounded px-1.5 py-0.5 text-xs text-htg-fg focus:outline-none focus:ring-1 focus:ring-htg-sage"
        disabled={saving}
      />
      {saving ? <Loader2 className="w-3 h-3 animate-spin text-htg-fg-muted" /> : (
        <>
          <button onClick={save} className="text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => { setDate(savedDate); setEditing(false); }} className="text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
        </>
      )}
    </span>
  );
}
