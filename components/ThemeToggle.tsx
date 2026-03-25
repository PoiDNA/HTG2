'use client';

import { useTheme } from './ThemeProvider';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg hover:bg-htg-surface transition-colors"
      aria-label={resolvedTheme === 'dark' ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-5 h-5 text-htg-warm" />
      ) : (
        <Moon className="w-5 h-5 text-htg-indigo" />
      )}
    </button>
  );
}
