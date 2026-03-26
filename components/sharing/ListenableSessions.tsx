'use client';

import { useState, useEffect } from 'react';
import { Headphones, Clock, User, Radio } from 'lucide-react';

interface ListenableSession {
  sharingId: string;
  sharingMode: string;
  liveSession: { id: string; phase: string; room_name: string } | null;
  slot: { slot_date: string; start_time: string; end_time: string } | null;
  sessionType: string;
  owner: { name: string };
}

export default function ListenableSessions() {
  const [sessions, setSessions] = useState<ListenableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/sharing/available')
      .then(r => r.json())
      .then(d => { setSessions(d.sessions || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleJoin(sharingId: string) {
    setJoining(sharingId);
    const res = await fetch('/api/sharing/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharingId }),
    });
    const data = await res.json();
    if (data.token && data.roomName) {
      // Redirect to live page as listener
      window.location.href = `/pl/live/${data.roomName}?listener=true&token=${encodeURIComponent(data.token)}`;
    } else {
      alert(data.error || 'Nie można dołączyć');
    }
    setJoining(null);
  }

  if (loading) return null;
  if (sessions.length === 0) return null;

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 mb-6">
      <h2 className="font-serif font-bold text-lg text-htg-fg mb-4 flex items-center gap-2">
        <Headphones className="w-5 h-5 text-htg-warm" />
        Sesje do odsłuchu
      </h2>
      <div className="space-y-3">
        {sessions.map(s => {
          const isLive = s.liveSession?.phase === 'sesja';
          return (
            <div key={s.sharingId} className="flex items-center justify-between p-4 bg-htg-surface rounded-lg">
              <div className="flex items-center gap-4">
                {isLive && (
                  <div className="relative">
                    <Radio className="w-5 h-5 text-red-400" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-htg-fg-muted" />
                    <span className="text-htg-fg font-medium text-sm">{s.owner.name}</span>
                    {isLive && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">LIVE</span>}
                  </div>
                  {s.slot && (
                    <div className="flex items-center gap-1 mt-1 text-htg-fg-muted text-xs">
                      <Clock className="w-3 h-3" />
                      {s.slot.slot_date} {s.slot.start_time?.slice(0, 5)}–{s.slot.end_time?.slice(0, 5)}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleJoin(s.sharingId)}
                disabled={!isLive || joining === s.sharingId}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isLive
                    ? 'bg-htg-sage text-white hover:bg-htg-sage-dark'
                    : 'bg-htg-surface text-htg-fg-muted cursor-not-allowed border border-htg-card-border'
                }`}
              >
                {joining === s.sharingId ? '...' : isLive ? 'Dołącz' : 'Oczekuje'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
