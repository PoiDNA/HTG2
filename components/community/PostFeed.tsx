'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
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
  const t = useTranslations('Community');
  const locale = useLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { posts, loading, loadingMore, hasMore, error, loadMore } = useFeed({
    groupId,
    search: debouncedSearch || undefined,
  });

  // Toast on error
  useEffect(() => {
    if (error) toast.error('Nie udało się załadować postów');
  }, [error]);

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
      body: JSON.stringify({ group_id: groupId, content, attachments, source_locale: locale }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Nie udało się opublikować');
    }

    toast.success('Post opublikowany');
  }, [groupId]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('search_placeholder')}
          className="w-full pl-10 pr-4 py-2.5 bg-htg-card border border-htg-card-border rounded-lg text-sm text-htg-fg placeholder:text-htg-fg-muted focus:outline-none focus:ring-1 focus:ring-htg-sage/50"
        />
      </div>

      {/* Post composer */}
      {canWrite && !debouncedSearch && (
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
            {debouncedSearch
              ? `Brak wyników dla "${debouncedSearch}"`
              : canWrite
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
