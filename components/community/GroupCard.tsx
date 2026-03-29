'use client';

import { Users, MessageSquare, Lock, Globe, Shield } from 'lucide-react';
import { Link } from '@/i18n-config';
import type { GroupWithMeta } from '@/lib/community/types';

interface GroupCardProps {
  group: GroupWithMeta;
}

export function GroupCard({ group }: GroupCardProps) {
  const visibilityIcon = {
    public: <Globe className="w-3.5 h-3.5" />,
    private: <Lock className="w-3.5 h-3.5" />,
    staff_only: <Shield className="w-3.5 h-3.5" />,
  }[group.visibility];

  const visibilityLabel = {
    public: 'Publiczna',
    private: 'Prywatna',
    staff_only: 'Staff',
  }[group.visibility];

  return (
    <Link
      href={`/spolecznosc/${group.slug}`}
      className="block bg-htg-card border border-htg-card-border rounded-xl p-4 hover:border-htg-sage/30 transition-colors group"
    >
      <div className="flex items-start gap-3">
        {/* Group avatar */}
        <div className="w-12 h-12 rounded-xl bg-htg-sage/10 flex items-center justify-center text-htg-sage shrink-0">
          <Users className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-htg-fg truncate group-hover:text-htg-sage transition-colors">
              {group.name}
            </h3>
            <span className="flex items-center gap-1 text-xs text-htg-fg-muted shrink-0">
              {visibilityIcon}
              {visibilityLabel}
            </span>
          </div>

          {group.description && (
            <p className="text-sm text-htg-fg-muted mt-0.5 line-clamp-2">
              {group.description}
            </p>
          )}

          <div className="flex items-center gap-4 mt-2 text-xs text-htg-fg-muted">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {group.member_count} {group.member_count === 1 ? 'członek' : 'członków'}
            </span>
            {group.last_post_at && (
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {formatLastActivity(group.last_post_at)}
              </span>
            )}
          </div>
        </div>

        {/* Join badge / Member badge */}
        <div className="shrink-0">
          {group.is_member ? (
            <span className="text-xs px-2 py-1 rounded-full bg-htg-sage/10 text-htg-sage font-medium">
              Członek
            </span>
          ) : group.visibility === 'public' ? (
            <span className="text-xs px-2 py-1 rounded-full bg-htg-surface text-htg-fg-muted font-medium">
              Dołącz
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function formatLastActivity(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (hrs < 1) return 'aktywna teraz';
  if (hrs < 24) return `${hrs}h temu`;
  if (days < 7) return `${days}d temu`;
  return new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}
