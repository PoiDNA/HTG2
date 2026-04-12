'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { useNotificationCount, useNotifications } from '@/lib/community/hooks/useNotifications';
import { useRouter } from 'next/navigation';
import { formatDate as formatDateIntl } from '@/lib/format';
import type { NotificationWithActor } from '@/lib/community/types';

interface NotificationBellProps {
  userId: string;
  alwaysShow?: boolean;
}

export function NotificationBell({ userId, alwaysShow = false }: NotificationBellProps) {
  const { count, resetCount } = useNotificationCount(userId);
  const { notifications, loading, fetchNotifications, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('Community');

  const handleOpen = useCallback(() => {
    if (!open) {
      fetchNotifications();
    }
    setOpen(!open);
  }, [open, fetchNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllRead();
    resetCount();
  }, [markAllRead, resetCount]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Hide bell when no notifications unless on community page
  // Must be AFTER all hooks to respect Rules of Hooks
  if (count === 0 && !alwaysShow) return null;

  const handleNotificationClick = (n: NotificationWithActor) => {
    if (n.group_slug) {
      router.push(`/spolecznosc/${n.group_slug}`);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
        title={t('notifications')}
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-96 bg-htg-card border border-htg-card-border rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-htg-card-border">
            <h3 className="font-medium text-sm text-htg-fg">Powiadomienia</h3>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-htg-sage hover:underline"
              >
                Oznacz jako przeczytane
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-72">
            {loading && notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-htg-fg-muted">
                Ładowanie...
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-htg-fg-muted">
                Brak powiadomień
              </div>
            )}

            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-htg-surface transition-colors border-b border-htg-card-border last:border-0 ${
                  !n.is_read ? 'bg-htg-sage/5' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <UserAvatar avatarUrl={n.actor?.avatar_url} displayName={n.actor?.display_name} size="sm" className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-htg-fg">
                      <span className="font-medium">{n.actor?.display_name || 'Ktoś'}</span>
                      {' '}
                      {getNotificationText(n)}
                    </p>
                    {n.group_name && (
                      <p className="text-xs text-htg-fg-muted mt-0.5">
                        w {n.group_name}
                      </p>
                    )}
                    <p className="text-xs text-htg-fg-muted mt-0.5">
                      {formatTimeAgo(n.created_at, locale)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-htg-sage shrink-0 mt-1.5" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getNotificationText(n: NotificationWithActor): string {
  const otherCount = (n.actor_ids?.length ?? 1) - 1;
  const suffix = otherCount > 0
    ? ` i ${otherCount} ${otherCount === 1 ? 'inna osoba' : otherCount < 5 ? 'inne osoby' : 'innych osób'}`
    : '';

  switch (n.type) {
    case 'comment': return `skomentował(a)${suffix} Twój post`;
    case 'reaction': return `polubił(a)${suffix} Twój post`;
    case 'mention': return 'wspomniał(a) o Tobie';
    case 'new_post': return 'dodał(a) nowy post';
    case 'group_invite': return 'zaprosił(a) Cię do grupy';
    default: return '';
  }
}

function formatTimeAgo(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (min < 1) return 'teraz';
  if (min < 60) return `${min} min temu`;
  if (hrs < 24) return `${hrs}h temu`;
  if (days < 7) return `${days}d temu`;
  return formatDateIntl(dateStr, locale, { day: 'numeric', month: 'short' });
}
