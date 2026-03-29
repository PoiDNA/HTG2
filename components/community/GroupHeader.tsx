'use client';

import { useState } from 'react';
import { ArrowLeft, Users, Lock, Globe, Shield, Loader2 } from 'lucide-react';
import { Link } from '@/i18n-config';
import type { CommunityGroup } from '@/lib/community/types';

interface GroupHeaderProps {
  group: CommunityGroup;
  memberCount: number;
  isMember: boolean;
  canModerate: boolean;
  slug: string;
}

export function GroupHeader({ group, memberCount, isMember, canModerate, slug }: GroupHeaderProps) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(isMember);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await fetch(`/api/community/groups/${slug}/join`, { method: 'POST' });
      if (res.ok) setJoined(true);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Czy na pewno chcesz opuścić tę grupę?')) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/community/groups/${slug}/join`, { method: 'DELETE' });
      if (res.ok) setJoined(false);
    } finally {
      setJoining(false);
    }
  };

  const visibilityBadge = {
    public: { icon: Globe, label: 'Publiczna', color: 'text-htg-sage' },
    private: { icon: Lock, label: 'Prywatna', color: 'text-htg-warm-text' },
    staff_only: { icon: Shield, label: 'Staff', color: 'text-htg-indigo' },
  }[group.visibility];

  const VisIcon = visibilityBadge.icon;

  return (
    <div className="mb-6">
      {/* Back link */}
      <Link
        href="/spolecznosc"
        className="flex items-center gap-1 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Społeczność
      </Link>

      {/* Group info */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-serif font-bold text-htg-fg">
                {group.name}
              </h1>
              <span className={`flex items-center gap-1 text-xs ${visibilityBadge.color}`}>
                <VisIcon className="w-3.5 h-3.5" />
                {visibilityBadge.label}
              </span>
            </div>

            {group.description && (
              <p className="text-sm text-htg-fg-muted mb-3">
                {group.description}
              </p>
            )}

            <div className="flex items-center gap-1 text-sm text-htg-fg-muted">
              <Users className="w-4 h-4" />
              <span>{memberCount} {memberCount === 1 ? 'członek' : 'członków'}</span>
            </div>
          </div>

          {/* Join/Leave button */}
          {group.visibility === 'public' && (
            <div>
              {joined ? (
                <button
                  onClick={handleLeave}
                  disabled={joining}
                  className="px-4 py-2 text-sm border border-htg-card-border rounded-lg text-htg-fg-muted hover:text-red-500 hover:border-red-500/30 transition-colors"
                >
                  {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Opuść'}
                </button>
              ) : (
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
                >
                  {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Dołącz'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
