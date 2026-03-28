'use client';

import { useEffect, useState, useCallback } from 'react';
import { Phone, Users, Clock } from 'lucide-react';

interface CallParticipant {
  userId: string;
  name: string;
  joinedAt: string | null;
}

interface ActiveCall {
  id: string;
  creatorName: string;
  isCreator: boolean;
  created_at: string;
  participants: CallParticipant[];
}

interface ActiveCallsWidgetProps {
  locale: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)  return `${diff}s temu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
  return `${Math.floor(diff / 3600)}h temu`;
}

export default function ActiveCallsWidget({ locale }: ActiveCallsWidgetProps) {
  const [calls, setCalls] = useState<ActiveCall[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quick-call/active');
      const data = await res.json();
      setCalls(data.calls ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  if (!calls.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-htg-fg">
        <div className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
        Aktywne połączenia
      </h3>

      {calls.map(call => (
        <div
          key={call.id}
          className="flex items-center justify-between p-4 rounded-xl
            bg-[#4ade80]/5 border border-[#4ade80]/20"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="w-4 h-4 text-[#4ade80] flex-shrink-0" />
              <span className="text-sm font-medium text-htg-fg">
                {call.isCreator ? 'Twoje połączenie' : `Połączenie od ${call.creatorName}`}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-htg-fg-muted">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {call.participants.length} {call.participants.length === 1 ? 'osoba' : 'osoby'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(call.created_at)}
              </span>
            </div>

            {/* Participant names */}
            <p className="text-xs text-htg-fg-muted/60 mt-1 truncate">
              {call.participants.map(p => p.name).join(', ')}
            </p>
          </div>

          <a
            href={`/${locale}/polaczenie/${call.id}`}
            className="ml-4 flex items-center gap-1.5 px-4 py-2 rounded-xl
              bg-[#4ade80]/15 hover:bg-[#4ade80]/25
              text-[#4ade80] text-sm font-medium transition-colors flex-shrink-0"
          >
            <Phone className="w-3.5 h-3.5" />
            Dołącz
          </a>
        </div>
      ))}
    </div>
  );
}
