'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';

interface Props {
  userId: string;
  initialName: string;
}

export default function ClientNameEditor({ userId, initialName }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const trimmed = name.trim();
    if (trimmed === savedName) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/update-profile-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, displayName: trimmed }),
      });
      if (res.ok) {
        setSavedName(trimmed);
        setName(trimmed);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function cancel() {
    setName(savedName);
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
        className="group flex items-center gap-1.5 text-htg-fg font-medium hover:text-htg-warm transition-colors"
        title="Zmień imię i nazwisko"
      >
        <span>{savedName || '—'}</span>
        <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className="bg-htg-surface border border-htg-card-border rounded px-2 py-0.5 text-sm text-htg-fg w-48 focus:outline-none focus:ring-1 focus:ring-htg-warm"
        placeholder="Imię i Nazwisko"
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
