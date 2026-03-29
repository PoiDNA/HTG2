'use client';

import { useState, useEffect, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { NotificationWithActor } from '../types';

export function useNotificationCount(userId: string | null) {
  const [count, setCount] = useState(0);

  // Initial fetch
  useEffect(() => {
    if (!userId) return;

    fetch('/api/community/notifications/count')
      .then(r => r.json())
      .then(data => setCount(data.count ?? 0))
      .catch(() => {});
  }, [userId]);

  // Realtime: listen for new notifications
  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowser();

    const channel = supabase
      .channel(`community:notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const resetCount = useCallback(() => setCount(0), []);

  return { count, resetCount };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationWithActor[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (cursorValue?: string | null) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '20' });
    if (cursorValue) params.set('cursor', cursorValue);

    try {
      const res = await fetch(`/api/community/notifications?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      if (cursorValue) {
        setNotifications(prev => [...prev, ...data.items]);
      } else {
        setNotifications(data.items);
      }
      setCursor(data.next_cursor);
      setHasMore(data.has_more);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (cursor) fetchNotifications(cursor);
  }, [cursor, fetchNotifications]);

  const markAllRead = useCallback(async () => {
    await fetch('/api/community/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }, []);

  return { notifications, loading, hasMore, fetchNotifications, loadMore, markAllRead };
}
