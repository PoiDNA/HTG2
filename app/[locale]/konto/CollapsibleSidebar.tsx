'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export default function CollapsibleSidebar({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [autoHidden, setAutoHidden] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('konto-sidebar-collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  // Desktop media query listener
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (!e.matches) {
        setAutoHidden(false);
        setManualOverride(false);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Scroll listener (desktop only)
  const handleScroll = useCallback(() => {
    if (!ticking.current) {
      ticking.current = true;
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const delta = scrollY - lastScrollY.current;

        if (delta > 10) {
          // Scrolling DOWN — auto-hide
          setAutoHidden(prev => {
            if (!prev) setManualOverride(false);
            return true;
          });
        } else if (delta < -10) {
          // Scrolling UP — show sidebar only when back near the top (nav level)
          const navBottom = navRef.current
            ? navRef.current.getBoundingClientRect().height + navRef.current.offsetTop
            : 200;
          if (scrollY <= navBottom) {
            setAutoHidden(false);
          }
        }

        lastScrollY.current = scrollY;
        ticking.current = false;
      });
    }
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    lastScrollY.current = window.scrollY;
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isDesktop, handleScroll]);

  const isHidden = mounted && (collapsed || (autoHidden && !manualOverride));

  const toggle = () => {
    if (collapsed) {
      setCollapsed(false);
      setAutoHidden(false);
      setManualOverride(true);
      localStorage.setItem('konto-sidebar-collapsed', 'false');
      return;
    }
    if (autoHidden && !manualOverride) {
      setManualOverride(true);
      return;
    }
    setCollapsed(true);
    setManualOverride(false);
    localStorage.setItem('konto-sidebar-collapsed', 'true');
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar */}
      <nav
        ref={navRef}
        inert={isDesktop && isHidden ? true : undefined}
        className={`shrink-0 transition-all duration-500 ease-in-out ${
          isHidden ? 'md:w-0 md:opacity-0 md:overflow-hidden md:pointer-events-none' : 'md:w-56'
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
          aria-label={isHidden ? 'Pokaż menu' : 'Ukryj menu'}
        >
          {isHidden ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
          <span>{isHidden ? 'Pokaż menu' : 'Ukryj menu'}</span>
        </button>
        {children}
      </div>
    </div>
  );
}
