'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Check, X, Loader2, UserMinus, UserCheck, Copy } from 'lucide-react';
import { useRouter } from '@/i18n-config';

interface Profile {
  id: string;
  email: string;
  display_name: string | null;
}

interface Props {
  bookingId: string;
  currentUserId: string;
  currentEmail: string;
}

export default function BookingUserEditor({ bookingId, currentUserId, currentEmail }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showFreeConfirm, setShowFreeConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 250);
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setSelected(null);
    fetchSuggestions(v);
  }

  function handleSelect(p: Profile) {
    setSelected(p);
    setQuery(p.email);
    setSuggestions([]);
  }

  async function handleSave() {
    if (!selected || selected.id === currentUserId) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/booking/change-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, newUserId: selected.id }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  async function handleFreeSlot() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/booking/change-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, newUserId: null }),
      });
      if (res.ok) {
        router.push('/prowadzacy/sesje');
      }
    } finally {
      setSaving(false);
      setShowFreeConfirm(false);
    }
  }

  function cancel() {
    setEditing(false);
    setQuery('');
    setSelected(null);
    setSuggestions([]);
    setShowFreeConfirm(false);
  }

  // Confirm free slot
  if (showFreeConfirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-red-400">Zwolnić termin? Rezerwacja zostanie usunięta.</span>
        <button
          onClick={handleFreeSlot}
          disabled={saving}
          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
          Tak, usuń
        </button>
        <button onClick={() => setShowFreeConfirm(false)} className="text-xs text-htg-fg-muted hover:text-htg-fg">
          Anuluj
        </button>
      </div>
    );
  }

  // Edit mode
  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="relative flex items-center gap-1.5">
          <div className="relative">
            <input
              ref={inputRef}
              type="email"
              value={query}
              onChange={handleQueryChange}
              placeholder="Wpisz e-mail użytkownika..."
              className="bg-htg-surface border border-htg-card-border rounded px-2 py-0.5 text-sm text-htg-fg w-64 focus:outline-none focus:ring-1 focus:ring-htg-indigo pr-6"
              disabled={saving}
              autoComplete="off"
            />
            {loadingSuggestions && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-htg-fg-muted" />
            )}

            {/* Dropdown suggestions */}
            {suggestions.length > 0 && (
              <div className="absolute left-0 top-full mt-1 w-72 bg-htg-card border border-htg-card-border rounded-lg shadow-lg z-50 overflow-hidden">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
                    className="w-full text-left px-3 py-2 hover:bg-htg-surface transition-colors flex flex-col gap-0.5"
                  >
                    <span className="text-sm text-htg-fg">{p.email}</span>
                    {p.display_name && (
                      <span className="text-xs text-htg-fg-muted">{p.display_name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin text-htg-fg-muted shrink-0" />
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={!selected || selected.id === currentUserId}
                className="text-green-400 hover:text-green-300 disabled:opacity-30 shrink-0"
                title="Zapisz"
              >
                <Check className="w-4 h-4" />
              </button>
              <button onClick={cancel} className="text-red-400 hover:text-red-300 shrink-0" title="Anuluj">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {selected && selected.id !== currentUserId && (
          <div className="flex items-center gap-1.5 text-xs text-htg-sage">
            <UserCheck className="w-3.5 h-3.5" />
            <span>{selected.display_name ? `${selected.display_name} (${selected.email})` : selected.email}</span>
          </div>
        )}

        {/* Free slot option */}
        <button
          onClick={() => setShowFreeConfirm(true)}
          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors mt-0.5 self-start"
        >
          <UserMinus className="w-3.5 h-3.5" />
          Zwolnij termin (usuń rezerwację)
        </button>
      </div>
    );
  }

  // View mode
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(currentEmail).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => setEditing(true)}
        className="group flex items-center gap-1 text-htg-fg-muted hover:text-htg-fg transition-colors text-sm"
        title="Zmień użytkownika sesji"
      >
        <span>{currentEmail}</span>
        <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
      </button>
      <button
        onClick={handleCopy}
        className="text-htg-fg-muted hover:text-htg-fg transition-colors shrink-0"
        title="Kopiuj email"
      >
        {copied
          ? <Check className="w-3.5 h-3.5 text-htg-sage" />
          : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
