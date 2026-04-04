'use client';

import { useState, useEffect } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export default function CollapsibleSidebar({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('konto-sidebar-collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem('konto-sidebar-collapsed', String(!v));
      return !v;
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar */}
      <nav
        className={`shrink-0 transition-all duration-200 ${
          mounted && collapsed ? 'md:w-0 md:opacity-0 md:overflow-hidden md:pointer-events-none' : 'md:w-56'
        }`}
      >
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          {sidebar}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-grow min-w-0">
        <button
          onClick={toggle}
          className="hidden md:flex items-center gap-1.5 mb-4 text-xs text-htg-fg-muted hover:text-htg-fg transition-colors"
          aria-label={collapsed ? 'Pokaż menu' : 'Ukryj menu'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
          <span>{collapsed ? 'Pokaż menu' : 'Ukryj menu'}</span>
        </button>
        {children}
      </div>
    </div>
  );
}
