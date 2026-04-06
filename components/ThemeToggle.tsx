'use client';

import { useTheme } from './ThemeProvider';
import { Sun, SunMoon } from 'lucide-react';

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg text-htg-fg-muted/30 hover:text-htg-warm hover:bg-htg-warm/10 active:text-htg-warm active:bg-htg-warm/20 transition-colors duration-300"
      aria-label={resolvedTheme === 'dark' ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-5 h-5" />
      ) : (
        <SunMoon className="w-5 h-5" />
      )}
    </button>
  );
}
