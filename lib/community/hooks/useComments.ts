'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { CommentWithAuthor, CursorPage } from '../types';

interface UseCommentsOptions {
  postId: string;
  limit?: number;
  enabled?: boolean;
}

export function useComments({ postId, limit = 20, enabled = true }: UseCommentsOptions) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchComments = useCallback(async (cursor?: string | null) => {
    const params = new URLSearchParams({ post_id: postId, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`/api/community/comments?${params}`);
    if (!res.ok) return null;

    return (await res.json()) as CursorPage<CommentWithAuthor>;
  }, [postId, limit]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    cursorRef.current = null;

    fetchComments().then(data => {
      if (data) {
        setComments(data.items);
        cursorRef.current = data.next_cursor;
        setHasMore(data.has_more);
      }
      setLoading(false);
    });
  }, [fetchComments, enabled]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const data = await fetchComments(cursorRef.current);
    if (data) {
      setComments(prev => [...prev, ...data.items]);
      cursorRef.current = data.next_cursor;
      setHasMore(data.has_more);
    }
    setLoadingMore(false);
  }, [fetchComments, loadingMore, hasMore]);

  // Realtime: listen for new comments on this post
  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowser();

    const channel = supabase
      .channel(`community:comments:${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_comments',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const newComment = payload.new as CommentWithAuthor;
          setComments(prev => {
            if (prev.some(c => c.id === newComment.id)) return prev;
            return [...prev, { ...newComment, author: null }];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'community_comments',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const updated = payload.new as CommentWithAuthor;
          setComments(prev =>
            prev
              .map(c => {
                if (c.id !== updated.id) return c;
                if (updated.deleted_at) return null;
                return { ...c, ...updated, author: c.author };
              })
              .filter(Boolean) as CommentWithAuthor[]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, enabled]);

  return { comments, loading, loadingMore, hasMore, loadMore, setComments };
}
