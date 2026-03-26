'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';
import { useUserRole } from '@/lib/useUserRole';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { useRouter } from '@/i18n-config';
import {
  ChevronDown,
  Film,
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
} from 'lucide-react';

export default function UserPanelNav() {
  const t = useTranslations('PanelNav');
  const { user, isAdmin, isStaff, isLoggedIn, loading } = useUserRole();
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
        className="flex items-center gap-1.5 text-sm font-medium text-htg-fg-muted hover:text-htg-fg transition-colors"
      >
        <UserCircle className="w-5 h-5" />
        <span className="hidden lg:inline max-w-[120px] truncate">{displayName}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-htg-card border border-htg-card-border rounded-xl shadow-lg z-50 py-2">
          {/* User info */}
          <div className="px-4 py-2 border-b border-htg-card-border">
            <p className="text-sm font-medium text-htg-fg truncate">{displayName}</p>
            {user?.email && displayName !== user.email && (
              <p className="text-xs text-htg-fg-muted truncate">{user.email}</p>
            )}
          </div>

          {/* User section */}
          <div className="py-1">
            <DropdownLink href="/konto" icon={Film} label={t('my_sessions')} onClick={() => setOpen(false)} />
            <DropdownLink href="/konto/sesje-indywidualne" icon={CalendarDays} label={t('individual_sessions')} onClick={() => setOpen(false)} />
            <DropdownLink href="/konto/subskrypcje" icon={CreditCard} label={t('my_subscriptions')} onClick={() => setOpen(false)} />
            <DropdownLink href="/konto/zamowienia" icon={FileText} label={t('orders')} onClick={() => setOpen(false)} />
            <DropdownLink href="/konto/profil" icon={UserCircle} label={t('profile')} onClick={() => setOpen(false)} />
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

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="border-t border-htg-card-border my-1" />
              <div className="py-1">
                <DropdownLink href="/admin" icon={LayoutDashboard} label={t('admin_panel')} onClick={() => setOpen(false)} />
                <DropdownLink href="/admin/kalendarz" icon={Calendar} label={t('admin_calendar')} onClick={() => setOpen(false)} />
                <DropdownLink href="/admin/kolejka" icon={Users} label={t('admin_queue')} onClick={() => setOpen(false)} />
                <DropdownLink href="/admin/sloty" icon={Clock} label={t('admin_slots')} onClick={() => setOpen(false)} />
                <DropdownLink href="/admin/uzytkownicy" icon={Users} label={t('admin_users')} onClick={() => setOpen(false)} />
                <DropdownLink href="/admin/subskrypcje" icon={CreditCard} label={t('admin_subscriptions')} onClick={() => setOpen(false)} />
                <DropdownLink href="/admin/sesje" icon={BookOpen} label={t('admin_sessions')} onClick={() => setOpen(false)} />
              </div>
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
  href: string;
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
