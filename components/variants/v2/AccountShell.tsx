import { Eye, ChevronLeft } from 'lucide-react';
import { stopUserImpersonation } from '@/lib/admin/impersonate';
import { Link } from '@/i18n-config';

/**
 * V2 „Sanctuary" Account Shell
 * Simple vertical nav list (no sidebar, no grid), full-width content, breadcrumb.
 */
export default function AccountShellV2({
  sidebar,
  viewAsUserEmail,
  locale,
  children,
}: {
  sidebar: React.ReactNode;
  viewAsUserEmail: string | null;
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      {viewAsUserEmail && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-600 dark:text-amber-400">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Przeglądasz konto jako: <strong>{viewAsUserEmail}</strong></span>
          <form action={stopUserImpersonation}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-xs font-medium transition-colors whitespace-nowrap">
              Wróć do admina
            </button>
          </form>
        </div>
      )}

      {/* Simple nav list — compact, one column */}
      <nav className="mb-8 border-b border-htg-card-border pb-4">
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {sidebar}
        </div>
      </nav>

      {/* Full-width content */}
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
