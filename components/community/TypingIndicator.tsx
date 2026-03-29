'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

interface TypingIndicatorProps {
  channelName: string;   // e.g., 'community:typing:post-{postId}'
  currentUserId: string;
  currentUserName: string;
}

/**
 * Typing indicator using Supabase Presence.
 * Shows "Anna pisze..." or "Anna i 2 inne osoby piszą..." in comment sections.
 */
export function TypingIndicator({ channelName, currentUserId, currentUserName }: TypingIndicatorProps) {
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; name: string }>>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createSupabaseBrowser>['channel']> | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string; name: string }>();
        const users: Array<{ userId: string; name: string }> = [];

        for (const key of Object.keys(state)) {
          const presences = state[key];
          for (const p of presences) {
            if (p.userId !== currentUserId) {
              users.push({ userId: p.userId, name: p.name });
            }
          }
        }

        setTypingUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Don't track presence by default — only when user is typing
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, currentUserId]);

  // Call this when the user starts typing
  const startTyping = useCallback(() => {
    channelRef.current?.track({
      userId: currentUserId,
      name: currentUserName,
    });
  }, [currentUserId, currentUserName]);

  // Call this when the user stops typing
  const stopTyping = useCallback(() => {
    channelRef.current?.untrack();
  }, []);

  // Auto-stop after 3 seconds of no typing
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTyping = useCallback(() => {
    startTyping();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(stopTyping, 3000);
  }, [startTyping, stopTyping]);

  if (typingUsers.length === 0) return null;

  const text = typingUsers.length === 1
    ? `${typingUsers[0].name} pisze...`
    : typingUsers.length === 2
    ? `${typingUsers[0].name} i ${typingUsers[1].name} piszą...`
    : `${typingUsers[0].name} i ${typingUsers.length - 1} ${typingUsers.length === 2 ? 'osoba' : 'osób'} piszą...`;

  return (
    <div className="px-4 py-1 text-xs text-htg-fg-muted animate-pulse">
      {text}
    </div>
  );
}

/**
 * Hook to emit typing events from the PostEditor.
 */
export function useTypingEmitter(channelName: string, userId: string, userName: string) {
  const channelRef = useRef<ReturnType<ReturnType<typeof createSupabaseBrowser>['channel']> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase.channel(channelName);
    channelRef.current = channel;
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName]);

  const emitTyping = useCallback(() => {
    channelRef.current?.track({ userId, name: userName });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      channelRef.current?.untrack();
    }, 3000);
  }, [userId, userName]);

  return emitTyping;
}
