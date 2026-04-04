'use client';

import { useState, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface CollapsibleSidebarProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export default function CollapsibleSidebar({ children, defaultCollapsed = false }: CollapsibleSidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `htg-sidebar-collapsed=${next ? '1' : '0'}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }, [collapsed]);

  return (
    <nav
      data-sidebar-collapsed={collapsed ? '' : undefined}
      className={`
        hidden md:block shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden
        ${collapsed ? 'w-14' : 'w-56'}
      `}
    >
      <style>{`
        [data-sidebar-collapsed] .sidebar-label {
          opacity: 0;
          max-width: 0;
          overflow: hidden;
          margin: 0;
          padding-left: 0;
          padding-right: 0;
        }
      `}</style>

      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Rozwiń menu' : 'Zwiń menu'}
        title={collapsed ? 'Rozwiń menu' : 'Zwiń menu'}
        className="mb-2 p-2 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors w-full flex justify-end"
      >
        {collapsed
          ? <PanelLeftOpen className="w-5 h-5" />
          : <PanelLeftClose className="w-5 h-5" />
        }
      </button>

      <div className="flex flex-col gap-1 overflow-hidden">
        {children}
      </div>
    </nav>
  );
}
