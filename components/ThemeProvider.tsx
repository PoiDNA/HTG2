'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { DesignVariant } from '@/lib/design-variant';

type Theme = 'light' | 'dark' | 'system';

/* ── Per-variant color palettes ─────────────────────────────────── */

type ColorVars = Record<string, string>;

const VARIANT_LIGHT: Record<DesignVariant, ColorVars> = {
  v1: {
    '--color-htg-bg': '#FDF5F0',
    '--color-htg-fg': '#3A2A30',
    '--color-htg-fg-muted': 'rgba(58,42,48,0.6)',
    '--color-htg-card': '#FFFFFF',
    '--color-htg-card-border': 'rgba(155,74,92,0.08)',
    '--color-htg-surface': 'rgba(155,74,92,0.04)',
  },
  v2: {
    '--color-htg-bg': '#F4F6FB',
    '--color-htg-fg': '#1E293B',
    '--color-htg-fg-muted': 'rgba(30,41,59,0.55)',
    '--color-htg-card': '#FFFFFF',
    '--color-htg-card-border': 'rgba(71,85,105,0.10)',
    '--color-htg-surface': 'rgba(71,85,105,0.04)',
  },
  v3: {
    '--color-htg-bg': '#FAFAF9',
    '--color-htg-fg': '#292524',
    '--color-htg-fg-muted': 'rgba(41,37,36,0.50)',
    '--color-htg-card': '#FFFFFF',
    '--color-htg-card-border': 'rgba(41,37,36,0.06)',
    '--color-htg-surface': 'rgba(41,37,36,0.03)',
  },
};

const VARIANT_DARK: Record<DesignVariant, ColorVars> = {
  v1: {
    '--color-htg-bg': '#14100E',
    '--color-htg-fg': '#E8DCD6',
    '--color-htg-fg-muted': 'rgba(232,220,214,0.6)',
    '--color-htg-card': '#221A1E',
    '--color-htg-card-border': '#322830',
    '--color-htg-surface': '#1C1418',
  },
  v2: {
    '--color-htg-bg': '#0F172A',
    '--color-htg-fg': '#E2E8F0',
    '--color-htg-fg-muted': 'rgba(226,232,240,0.55)',
    '--color-htg-card': '#1E293B',
    '--color-htg-card-border': '#334155',
    '--color-htg-surface': '#1A2332',
  },
  v3: {
    '--color-htg-bg': '#0C0A09',
    '--color-htg-fg': '#E7E5E4',
    '--color-htg-fg-muted': 'rgba(231,229,228,0.50)',
    '--color-htg-card': '#1C1917',
    '--color-htg-card-border': '#292524',
    '--color-htg-surface': '#171412',
  },
};

/* ── Legacy exports (unchanged, always v1 for backward compat) ── */

export const DARK_VARS = VARIANT_DARK.v1;
export const LIGHT_VARS = VARIANT_LIGHT.v1;

/* ── Theme context ──────────────────────────────────────────────── */

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/* ── Per-variant accent overrides ───────────────────────────────── */

const VARIANT_ACCENTS: Partial<Record<DesignVariant, ColorVars>> = {
  v3: {
    '--color-htg-indigo': '#B8860B',      // dark goldenrod as primary accent
    '--color-htg-indigo-light': '#D4A840', // warm gold hover
    '--color-htg-sage': '#5A8A4E',         // sage stays for CTA
    '--color-htg-sage-dark': '#4A7A3E',    // slightly darker sage
  },
};

function applyTheme(isDark: boolean, variant: DesignVariant = 'v1') {
  const d = document.documentElement;
  const vars = isDark ? VARIANT_DARK[variant] : VARIANT_LIGHT[variant];
  if (isDark) {
    d.classList.add('dark');
  } else {
    d.classList.remove('dark');
  }
  Object.entries(vars).forEach(([k, v]) => d.style.setProperty(k, v));
  // Apply accent overrides for variant
  const accents = VARIANT_ACCENTS[variant];
  if (accents) {
    Object.entries(accents).forEach(([k, v]) => d.style.setProperty(k, v));
  }
}

export default function ThemeProvider({
  children,
  variant = 'v1',
}: {
  children: React.ReactNode;
  variant?: DesignVariant;
}) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('htg-theme', t);
    const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme:dark)').matches);
    setResolvedTheme(isDark ? 'dark' : 'light');
    applyTheme(isDark, variant);
  }, [variant]);

  useEffect(() => {
    const stored = localStorage.getItem('htg-theme') as Theme | null;
    // V3 defaults to dark if user has no explicit preference
    const t = stored || (variant === 'v3' ? 'dark' : 'system');
    setThemeState(t);
    const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme:dark)').matches);
    setResolvedTheme(isDark ? 'dark' : 'light');
    applyTheme(isDark, variant);

    const mq = window.matchMedia('(prefers-color-scheme:dark)');
    const handler = () => {
      if ((localStorage.getItem('htg-theme') || 'system') === 'system') {
        const dark = mq.matches;
        setResolvedTheme(dark ? 'dark' : 'light');
        applyTheme(dark, variant);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [variant]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
