'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useFeed } from '@/lib/community/hooks/useFeed';
import { PostCard } from './PostCard';
import { PostEditor } from './PostEditor';
import type { TipTapContent, Attachment } from '@/lib/community/types';

interface PostFeedProps {
  groupId: string;
  currentUserId: string;
  canWrite: boolean;
  canModerate: boolean;
}

export function PostFeed({ groupId, currentUserId, canWrite, canModerate }: PostFeedProps) {
  const { posts, loading, loadingMore, hasMore, loadMore } = useFeed({ groupId });
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  const handleCreatePost = useCallback(async (content: TipTapContent, attachments: Attachment[]) => {
    const res = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, content, attachments }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Nie udało się opublikować');
    }
  }, [groupId]);

  return (
    <div className="space-y-4">
      {/* Post composer */}
      {canWrite && (
        <PostEditor
          groupId={groupId}
          onSubmit={handleCreatePost}
        />
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-htg-fg-muted" />
        </div>
      )}

      {/* Empty state */}
      {!loading && posts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-htg-fg-muted">
            {canWrite
              ? 'Brak postów. Bądź pierwszy i napisz coś!'
              : 'Brak postów w tej grupie.'}
          </p>
        </div>
      )}

      {/* Posts */}
      {posts.map(post => (
        <PostCard
          key={post.id}
          post={post}
          groupId={groupId}
          currentUserId={currentUserId}
          canModerate={canModerate}
        />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />

      {/* Loading more */}
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-htg-fg-muted" />
        </div>
      )}
    </div>
  );
}
