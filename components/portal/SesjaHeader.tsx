'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Video, LogOut } from 'lucide-react';

interface SesjaHeaderProps {
  userEmail: string;
  locale: string;
}

export default function SesjaHeader({ userEmail, locale }: SesjaHeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
  }

  return (
    <header className="flex items-center justify-between mb-8 pb-4 border-b border-htg-card-border">
      <a href={`/${locale}/konto/sesja-panel`} className="flex items-center gap-2 text-htg-fg hover:text-htg-sage transition-colors">
        <Video className="w-6 h-6" />
        <span className="text-lg font-serif font-bold">Twoje sesje</span>
      </a>
      <div className="flex items-center gap-4">
        <span className="text-sm text-htg-fg-muted hidden sm:block">{userEmail}</span>
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg text-htg-fg-muted hover:text-red-500 hover:bg-htg-surface transition-colors"
          title="Log out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
