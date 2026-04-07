import { Eye } from 'lucide-react';
import { stopUserImpersonation } from '@/lib/admin/impersonate';
import CollapsibleSidebar from '@/app/[locale]/konto/CollapsibleSidebar';

export default function AccountShellV1({
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
    <div className="mx-auto max-w-6xl px-6 py-8">
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
      <CollapsibleSidebar sidebar={sidebar}>
        {children}
      </CollapsibleSidebar>
    </div>
  );
}
