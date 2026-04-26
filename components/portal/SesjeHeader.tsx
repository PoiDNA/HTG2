'use client';

import { useRouter } from '@/i18n-config';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { CalendarDays, LogOut } from 'lucide-react';

interface SesjeHeaderProps {
  userEmail: string;
  locale: string;
}

export default function SesjeHeader({ userEmail, locale }: SesjeHeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header className="flex items-center justify-between mb-8 pb-4 border-b border-htg-card-border">
      <a href={`/${locale}/konto/sesje-panel`} className="flex items-center gap-2 text-htg-fg hover:text-htg-sage transition-colors">
        <CalendarDays className="w-6 h-6" />
        <span className="text-lg font-serif font-bold">Panel sesji</span>
      </a>
      <div className="flex items-center gap-4">
        <span className="text-sm text-htg-fg-muted hidden sm:block">{userEmail}</span>
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg text-htg-fg-muted hover:text-red-500 hover:bg-htg-surface transition-colors"
          title="Wyloguj"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
