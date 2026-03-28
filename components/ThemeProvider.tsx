'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

const DARK_VARS: Record<string, string> = {
  '--color-htg-bg': '#14100E',
  '--color-htg-fg': '#E8DCD6',
  '--color-htg-fg-muted': 'rgba(232,220,214,0.6)',
  '--color-htg-card': '#221A1E',
  '--color-htg-card-border': '#322830',
  '--color-htg-surface': '#1C1418',
};

const LIGHT_VARS: Record<string, string> = {
  '--color-htg-bg': '#FDF5F0',
  '--color-htg-fg': '#3A2A30',
  '--color-htg-fg-muted': 'rgba(58,42,48,0.6)',
  '--color-htg-card': '#FFFFFF',
  '--color-htg-card-border': 'rgba(155,74,92,0.08)',
  '--color-htg-surface': 'rgba(155,74,92,0.04)',
};

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

function applyTheme(isDark: boolean) {
  const d = document.documentElement;
  const vars = isDark ? DARK_VARS : LIGHT_VARS;
  if (isDark) {
    d.classList.add('dark');
  } else {
    d.classList.remove('dark');
  }
  Object.entries(vars).forEach(([k, v]) => d.style.setProperty(k, v));
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('htg-theme', t);
    const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme:dark)').matches);
    setResolvedTheme(isDark ? 'dark' : 'light');
    applyTheme(isDark);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('htg-theme') as Theme | null;
    const t = stored || 'system';
    setThemeState(t);
    const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme:dark)').matches);
    setResolvedTheme(isDark ? 'dark' : 'light');

    const mq = window.matchMedia('(prefers-color-scheme:dark)');
    const handler = () => {
      if ((localStorage.getItem('htg-theme') || 'system') === 'system') {
        const dark = mq.matches;
        setResolvedTheme(dark ? 'dark' : 'light');
        applyTheme(dark);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
