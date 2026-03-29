'use client';

import { useComments } from '@/lib/community/hooks/useComments';
import { PostEditor } from './PostEditor';
import { CommentItem } from './CommentItem';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { TipTapContent, Attachment, CommentWithAuthor } from '@/lib/community/types';

interface CommentSectionProps {
  postId: string;
  groupId: string;
  currentUserId: string;
  canModerate: boolean;
}

export function CommentSection({ postId, groupId, currentUserId, canModerate }: CommentSectionProps) {
  const { comments, loading, loadingMore, hasMore, loadMore } = useComments({
    postId,
    enabled: true,
  });

  const submitComment = async (content: TipTapContent, attachments: Attachment[], parentId?: string) => {
    const res = await fetch('/api/community/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: postId,
        content,
        attachments,
        parent_id: parentId || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Nie udało się dodać komentarza');
    }
  };

  const handleTopLevelSubmit = async (content: TipTapContent, attachments: Attachment[]) => {
    await submitComment(content, attachments);
  };

  const handleReplySubmit = async (parentId: string, content: TipTapContent, attachments: Attachment[]) => {
    await submitComment(content, attachments, parentId);
  };

  // Group comments: top-level + their replies
  const topLevel = comments.filter(c => !c.parent_id);
  const repliesMap = new Map<string, CommentWithAuthor[]>();
  for (const c of comments) {
    if (c.parent_id) {
      const existing = repliesMap.get(c.parent_id) || [];
      existing.push(c);
      repliesMap.set(c.parent_id, existing);
    }
  }

  return (
    <div className="border-t border-htg-card-border">
      {/* Comment list */}
      <div className="px-4 py-2 space-y-1">
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-htg-fg-muted" />
          </div>
        )}

        {topLevel.map(comment => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            canModerate={canModerate}
            groupId={groupId}
            replies={repliesMap.get(comment.id) || []}
            onReplySubmit={handleReplySubmit}
          />
        ))}

        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-sm text-htg-sage hover:underline py-1"
          >
            {loadingMore ? 'Ładowanie...' : 'Pokaż więcej komentarzy'}
          </button>
        )}
      </div>

      {/* Comment input */}
      <div className="px-4 pb-3">
        <PostEditor
          groupId={groupId}
          compact
          onSubmit={handleTopLevelSubmit}
        />
      </div>
    </div>
  );
}
