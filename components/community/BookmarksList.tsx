'use client';

import { useState, useEffect } from 'react';
import { Loader2, Bookmark } from 'lucide-react';
import { PostCard } from './PostCard';
import type { PostWithAuthor } from '@/lib/community/types';

interface BookmarksListProps {
  currentUserId: string;
}

export function BookmarksList({ currentUserId }: BookmarksListProps) {
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/community/bookmarks?limit=50')
      .then(r => r.json())
      .then(data => {
        setPosts(data.items ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-htg-fg-muted" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <Bookmark className="w-10 h-10 text-htg-fg-muted mx-auto mb-3" />
        <p className="text-htg-fg-muted">Nie masz jeszcze zapisanych postów.</p>
        <p className="text-sm text-htg-fg-muted mt-1">Kliknij ikonkę zakładki pod postem, żeby go zapisać.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map(post => (
        <PostCard
          key={post.id}
          post={{ ...post, user_has_reacted: false }}
          groupId={post.group_id}
          currentUserId={currentUserId}
          canModerate={false}
        />
      ))}
    </div>
  );
}
