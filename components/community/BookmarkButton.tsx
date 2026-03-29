'use client';

import { useState, useCallback } from 'react';
import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';

interface BookmarkButtonProps {
  postId: string;
  initialBookmarked?: boolean;
}

export function BookmarkButton({ postId, initialBookmarked = false }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [toggling, setToggling] = useState(false);

  const toggle = useCallback(async () => {
    if (toggling) return;
    setToggling(true);
    const was = bookmarked;
    setBookmarked(!was);

    try {
      const res = await fetch('/api/community/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      });

      if (!res.ok) {
        setBookmarked(was);
        toast.error('Nie udało się zapisać');
      } else {
        const data = await res.json();
        if (data.action === 'added') toast.success('Zapisano');
      }
    } catch {
      setBookmarked(was);
    } finally {
      setToggling(false);
    }
  }, [postId, bookmarked, toggling]);

  return (
    <button
      onClick={toggle}
      disabled={toggling}
      className={`flex items-center gap-1 text-sm transition-colors ${
        bookmarked ? 'text-htg-warm' : 'text-htg-fg-muted hover:text-htg-warm'
      }`}
      title={bookmarked ? 'Usuń z zapisanych' : 'Zapisz na później'}
    >
      <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
    </button>
  );
}
