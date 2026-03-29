'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { PostWithAuthor, CursorPage } from '../types';

interface UseFeedOptions {
  groupId: string;
  limit?: number;
}

export function useFeed({ groupId, limit = 20 }: UseFeedOptions) {
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  const fetchPosts = useCallback(async (cursor?: string | null) => {
    try {
      const params = new URLSearchParams({ group_id: groupId, limit: String(limit) });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/community/posts?${params}`);
      if (!res.ok) throw new Error('Failed to fetch posts');

      const data: CursorPage<PostWithAuthor> = await res.json();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      return null;
    }
  }, [groupId, limit]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setError(null);
    setPosts([]);
    cursorRef.current = null;

    fetchPosts().then(data => {
      if (data) {
        setPosts(data.items);
        cursorRef.current = data.next_cursor;
        setHasMore(data.has_more);
      }
      setLoading(false);
    });
  }, [fetchPosts]);

  // Load more (infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const data = await fetchPosts(cursorRef.current);
    if (data) {
      setPosts(prev => [...prev, ...data.items]);
      cursorRef.current = data.next_cursor;
      setHasMore(data.has_more);
    }
    setLoadingMore(false);
  }, [fetchPosts, loadingMore, hasMore]);

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createSupabaseBrowser();

    const channel = supabase
      .channel(`community:posts:${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_posts',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          // New post — prepend to feed (will fetch full data on next refresh)
          // For now, add the raw payload. Full author data will come from API.
          const newPost = payload.new as PostWithAuthor;
          setPosts(prev => {
            // Avoid duplicates
            if (prev.some(p => p.id === newPost.id)) return prev;
            return [{ ...newPost, author: null, user_has_reacted: false }, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'community_posts',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const updated = payload.new as PostWithAuthor;
          setPosts(prev =>
            prev.map(p => {
              if (p.id !== updated.id) return p;
              // If soft-deleted, remove from feed
              if (updated.deleted_at) return null;
              // Merge: keep author data, update counts etc.
              return { ...p, ...updated, author: p.author };
            }).filter(Boolean) as PostWithAuthor[]
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'community_posts',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const deletedId = payload.old.id;
          setPosts(prev => prev.filter(p => p.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  return {
    posts,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    setPosts,
  };
}
