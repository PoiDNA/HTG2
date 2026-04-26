'use client';

import { useState, useRef, useEffect, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';
import { useUserRole } from '@/lib/useUserRole';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { useRouter } from '@/i18n-config';
import {
  ChevronDown,
  Film,
  Headphones,
  CalendarDays,
  CreditCard,
  FileText,
  UserCircle,
  LayoutDashboard,
  Calendar,
  Users,
  Clock,
  LogOut,
  Presentation,
  BookOpen,
  Eye,
  MessagesSquare,
  Mail,
  Globe2,
} from 'lucide-react';

export default function UserPanelNav() {
  const t = useTranslations('PanelNav');
  const { user, isAdmin, isStaff, isTranslator, isLoggedIn, loading } = useUserRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (loading || !isLoggedIn) return null;

  const displayName = user?.user_metadata?.full_name || user?.email || '';

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm font-medium text-htg-fg-muted hover:text-htg-fg transition-colors"
      >
        <UserCircle className="w-5 h-5" />
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-htg-card border border-htg-card-border rounded-xl shadow-lg z-50 py-2">
          {/* User info */}
          <div className="px-4 py-2 border-b border-htg-card-border">
            <p className="text-sm font-medium text-htg-fg truncate">{displayName}</p>
          </div>

          {/* Admin: show only admin items, no user/staff sections */}
          {isAdmin ? (
            <div className="py-1">
              <DropdownLink href="/konto/admin/uzytkownicy" icon={Users} label={t('admin_users')} onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/admin/planer" icon={BookOpen} label={t('admin_sessions')} onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/admin/podglad" icon={Eye} label={t('admin_preview')} onClick={() => setOpen(false)} />
              <DropdownLink href="/spolecznosc" icon={MessagesSquare} label={t('community')} onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/admin/skrzynka" icon={Mail} label="Skrzynka" onClick={() => setOpen(false)} />
              <div className="border-t border-htg-card-border my-1" />
              <DropdownLink href="/konto/admin" icon={LayoutDashboard} label={t('admin_panel')} onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/admin/kalendarz" icon={Calendar} label={t('admin_calendar')} onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/admin/kolejka" icon={Users} label={t('admin_queue')} onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/admin/sloty" icon={Clock} label={t('admin_slots')} onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/admin/subskrypcje" icon={CreditCard} label={t('admin_subscriptions')} onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/admin/nagrania-klientow" icon={Headphones} label="Nagrania klientów" onClick={() => setOpen(false)} />
              <DropdownLink href="/konto/aktualizacja" icon={UserCircle} label="Aktualizacja" onClick={() => setOpen(false)} />
              <div className="border-t border-htg-card-border my-1" />
              <DropdownLink href="/prowadzacy/spotkania-htg" icon={Presentation} label="Spotkania" onClick={() => setOpen(false)} />
            </div>
          ) : (
            <>
              {/* User section */}
              <div className="py-1">
                <DropdownLink href="/konto/nagrania-sesji" icon={Headphones} label={t('session_recordings')} onClick={() => setOpen(false)} />
                <DropdownLink href="/spolecznosc" icon={MessagesSquare} label={t('community')} onClick={() => setOpen(false)} />
              </div>

              {/* Staff section */}
              {isStaff && (
                <>
                  <div className="border-t border-htg-card-border my-1" />
                  <div className="py-1">
                    <DropdownLink href="/prowadzacy" icon={LayoutDashboard} label={t('staff_panel')} onClick={() => setOpen(false)} />
                    <DropdownLink href="/prowadzacy/grafik" icon={Calendar} label={t('staff_schedule')} onClick={() => setOpen(false)} />
                    <DropdownLink href="/prowadzacy/sesje" icon={Presentation} label={t('staff_sessions')} onClick={() => setOpen(false)} />
                  </div>
                </>
              )}

              {/* Translator section */}
              {isTranslator && (
                <>
                  <div className="border-t border-htg-card-border my-1" />
                  <div className="py-1">
                    <DropdownLink href="/konto/tlumacz" icon={Globe2} label={t('translator_panel')} onClick={() => setOpen(false)} />
                  </div>
                </>
              )}
            </>
          )}

          {/* Logout */}
          <div className="border-t border-htg-card-border my-1" />
          <div className="py-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-htg-surface transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t('logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: ComponentProps<typeof Link>['href'];
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}
