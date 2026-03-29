'use client';

import { useState, useEffect } from 'react';
import { Link2, Copy, Check, Loader2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface InviteLinkManagerProps {
  groupId: string;
  groupSlug: string;
}

interface InviteLink {
  id: string;
  token: string;
  invite_url: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export function InviteLinkManager({ groupId, groupSlug }: InviteLinkManagerProps) {
  const [invites, setInvites] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/community/invite?group_id=${groupId}`)
      .then(r => r.json())
      .then(data => { setInvites(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [groupId]);

  const createInvite = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/community/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
      if (!res.ok) throw new Error();
      const invite = await res.json();
      setInvites(prev => [invite, ...prev]);
      toast.success('Link zaproszenia utworzony');
    } catch {
      toast.error('Nie udało się utworzyć linku');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    toast.success('Skopiowano link');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-htg-fg flex items-center gap-1">
          <Link2 className="w-4 h-4" />
          Linki zaproszeniowe
        </h4>
        <button
          onClick={createInvite}
          disabled={creating}
          className="flex items-center gap-1 px-3 py-1.5 bg-htg-sage text-white rounded-lg text-xs font-medium hover:bg-htg-sage-dark disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Nowy link
        </button>
      </div>

      {loading && <p className="text-xs text-htg-fg-muted">Ładowanie...</p>}

      {!loading && invites.length === 0 && (
        <p className="text-xs text-htg-fg-muted">Brak aktywnych linków. Utwórz nowy.</p>
      )}

      <div className="space-y-2">
        {invites.map(inv => (
          <div key={inv.id} className="flex items-center gap-2 px-3 py-2 bg-htg-card border border-htg-card-border rounded-lg">
            <code className="text-xs text-htg-fg-muted flex-1 truncate">{inv.invite_url}</code>
            <span className="text-xs text-htg-fg-muted shrink-0">
              {inv.use_count}{inv.max_uses ? `/${inv.max_uses}` : ''} użyć
            </span>
            <button
              onClick={() => copyLink(inv.invite_url, inv.id)}
              className="p-1 rounded text-htg-fg-muted hover:text-htg-sage"
            >
              {copied === inv.id ? <Check className="w-3.5 h-3.5 text-htg-sage" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
