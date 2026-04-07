'use client';

import { useState, useEffect } from 'react';
import { Eye, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { stopUserImpersonation } from '@/lib/admin/impersonate';

/**
 * V3 „Sanctum" Account Shell
 * Left collapsible sidebar: 48px icons-only → 200px expanded.
 */
export default function AccountShellV3({
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
  const [expanded, setExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
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

      {sidebar ? (
        <div className="flex flex-col md:flex-row gap-6">
          {/* Collapsible left sidebar (admin/staff only) */}
          {isDesktop ? (
            <nav
              className={`shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
                expanded ? 'w-[200px]' : 'w-12'
              }`}
              onMouseEnter={() => setExpanded(true)}
              onMouseLeave={() => setExpanded(false)}
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="flex items-center gap-2 px-3 py-2 mb-2 text-xs text-htg-fg-muted hover:text-htg-fg transition-colors"
                  aria-label={expanded ? 'Zwiń menu' : 'Rozwiń menu'}
                >
                  {expanded ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                  {expanded && <span>Zwiń</span>}
                </button>
                <div className={expanded ? '' : '[&_a]:justify-center [&_a>span:last-child]:hidden [&_p]:hidden [&_a]:px-2'}>
                  {sidebar}
                </div>
              </div>
            </nav>
          ) : (
            <nav className="overflow-x-auto pb-2">
              <div className="flex gap-1">
                {sidebar}
              </div>
            </nav>
          )}

          <div className="flex-grow min-w-0">
            {children}
          </div>
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}
