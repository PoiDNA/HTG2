'use client';

import { Link } from '@/i18n-config';
import { PublicationStatusBadge } from './PublicationStatusBadge';
import type { SessionPublication } from '@/lib/publication/types';

interface SessionTableProps {
  sessions: SessionPublication[];
  labels: {
    col_title: string;
    col_date: string;
    col_status: string;
    col_editor: string;
    col_actions: string;
    view: string;
    unassigned: string;
    no_sessions: string;
  };
  statusLabels?: Record<string, string>;
  locale: string;
}

export function SessionTable({ sessions, labels, statusLabels, locale }: SessionTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
        <p className="text-sm text-htg-fg-muted">{labels.no_sessions}</p>
      </div>
    );
  }

  // Group by monthly_set
  const grouped = new Map<string, { title: string; sessions: SessionPublication[] }>();

  for (const session of sessions) {
    const key = session.monthly_set?.id || '_none';
    const title = session.monthly_set?.title || session.monthly_set?.month || '';
    if (!grouped.has(key)) {
      grouped.set(key, { title, sessions: [] });
    }
    grouped.get(key)!.sessions.push(session);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([key, group]) => (
        <div key={key} className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
          {group.title && (
            <div className="px-6 py-3 border-b border-htg-card-border bg-htg-surface">
              <h3 className="text-sm font-semibold text-htg-fg">{group.title}</h3>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-htg-fg-muted border-b border-htg-card-border">
                  <th className="px-6 py-3 pr-4">{labels.col_title}</th>
                  <th className="px-4 py-3">{labels.col_date}</th>
                  <th className="px-4 py-3">{labels.col_status}</th>
                  <th className="px-4 py-3">{labels.col_editor}</th>
                  <th className="px-4 py-3">{labels.col_actions}</th>
                </tr>
              </thead>
              <tbody>
                {group.sessions.map((session) => (
                  <tr key={session.id} className="border-b border-htg-card-border last:border-0 hover:bg-htg-surface transition-colors">
                    <td className="px-6 py-3 pr-4 text-htg-fg font-medium">
                      {session.title || session.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-htg-fg-muted">
                      {new Date(session.created_at).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3">
                      <PublicationStatusBadge status={session.status} labels={statusLabels} />
                    </td>
                    <td className="px-4 py-3 text-htg-fg-muted">
                      {session.assigned_editor?.display_name ||
                        session.assigned_editor?.email ||
                        labels.unassigned}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/publikacja/sesje/${session.id}`}
                        className="text-sm text-htg-sage hover:text-htg-sage/80 font-medium"
                      >
                        {labels.view}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
