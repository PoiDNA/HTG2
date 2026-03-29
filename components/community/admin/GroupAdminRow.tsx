'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, MessageSquare, Lock, Globe, Shield, Archive, Loader2, UserPlus, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from '@/i18n-config';
import { AddMemberForm } from './AddMemberForm';
import { InviteLinkManager } from './InviteLinkManager';

interface GroupAdminRowProps {
  group: {
    id: string;
    name: string;
    slug: string;
    visibility: string;
    type: string;
    is_archived: boolean;
    member_count: number;
    post_count: number;
    created_at: string;
  };
  locale: string;
}

export function GroupAdminRow({ group, locale }: GroupAdminRowProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const visibilityIcon = {
    public: <Globe className="w-3.5 h-3.5" />,
    private: <Lock className="w-3.5 h-3.5" />,
    staff_only: <Shield className="w-3.5 h-3.5" />,
  }[group.visibility] ?? <Globe className="w-3.5 h-3.5" />;

  const visibilityLabel = {
    public: 'Publiczna',
    private: 'Prywatna',
    staff_only: 'Staff',
  }[group.visibility] ?? group.visibility;

  const typeLabel = {
    topic: 'Tematyczna',
    post_session: 'Po spotkaniu',
    staff: 'Staff',
  }[group.type] ?? group.type;

  const handleArchive = async () => {
    if (!confirm(`Czy na pewno chcesz ${group.is_archived ? 'przywrócić' : 'zarchiwizować'} grupę "${group.name}"?`)) return;
    setArchiving(true);
    try {
      await fetch(`/api/community/groups/${group.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: !group.is_archived }),
      });
      router.refresh();
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className={`bg-htg-card border rounded-xl overflow-hidden ${group.is_archived ? 'border-htg-card-border opacity-60' : 'border-htg-card-border'}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-htg-fg truncate">{group.name}</h3>
            <span className="flex items-center gap-1 text-xs text-htg-fg-muted">
              {visibilityIcon} {visibilityLabel}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-htg-surface text-htg-fg-muted">
              {typeLabel}
            </span>
            {group.is_archived && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Archiwum</span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-htg-fg-muted">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {group.member_count}</span>
            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {group.post_count} postów</span>
            <span>/spolecznosc/{group.slug}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Link
            href={`/spolecznosc/${group.slug}`}
            className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-sage hover:bg-htg-surface transition-colors"
            title="Otwórz grupę"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-warm hover:bg-htg-surface transition-colors disabled:opacity-50"
            title={group.is_archived ? 'Przywróć' : 'Zarchiwizuj'}
          >
            {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded: Add members */}
      {expanded && (
        <div className="border-t border-htg-card-border p-4 bg-htg-surface/50 space-y-6">
          <div>
            <h4 className="text-sm font-medium text-htg-fg mb-3 flex items-center gap-1">
              <UserPlus className="w-4 h-4" />
              Dodaj członków po email
            </h4>
            <AddMemberForm groupId={group.id} groupSlug={group.slug} />
          </div>
          <InviteLinkManager groupId={group.id} groupSlug={group.slug} />
        </div>
      )}
    </div>
  );
}
