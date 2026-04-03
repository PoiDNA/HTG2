'use client';

import { useEffect, useState } from 'react';

interface ActiveSession {
  type: 'individual' | 'meeting';
  label: string;
  clientName?: string;
}

interface Props {
  showClientName?: boolean;
}

export default function ActiveSessionIndicator({ showClientName = false }: Props) {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/public/active-sessions');
        const data = await res.json();
        if (!cancelled) setSessions(data.sessions ?? []);
      } catch {}
    };

    check();
    const iv = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div className="space-y-2">
      {sessions.map((s, i) => (
        <div
          key={`${s.type}-${i}`}
          className="flex items-center gap-2 bg-htg-sage/10 text-htg-sage px-4 py-2 rounded-full text-sm font-medium"
        >
          <span className="w-2 h-2 bg-htg-sage rounded-full animate-pulse shrink-0" />
          <span className="truncate">
            {s.label}
            {showClientName && s.clientName && (
              <span className="text-htg-fg-muted"> — {s.clientName}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
