'use client';

import { useState } from 'react';
import { MoreHorizontal, Trash2, Flag, Clock, Reply } from 'lucide-react';
import { toast } from 'sonner';
import { UserAvatar } from './UserAvatar';
import { ReportModal } from './ReportModal';
import { PostEditor } from './PostEditor';
import type { CommentWithAuthor, TipTapContent, Attachment } from '@/lib/community/types';

interface CommentItemProps {
  comment: CommentWithAuthor;
  currentUserId: string;
  canModerate: boolean;
  groupId: string;
  depth?: number;
  replies?: CommentWithAuthor[];
  onReplySubmit?: (parentId: string, content: TipTapContent, attachments: Attachment[]) => Promise<void>;
}

export function CommentItem({ comment, currentUserId, canModerate, groupId, depth = 0, replies = [], onReplySubmit }: CommentItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  if (isDeleted) return null;

  const isAuthor = comment.user_id === currentUserId;
  const maxDepth = 2; // Max nesting level

  const handleDelete = async () => {
    if (!confirm('Czy na pewno chcesz usunąć ten komentarz?')) return;
    try {
      const res = await fetch(`/api/community/comments/${comment.id}`, { method: 'DELETE' });
      if (res.ok) { setIsDeleted(true); toast.success('Komentarz usunięty'); }
      else toast.error('Nie udało się usunąć komentarza');
    } catch { toast.error('Nie udało się usunąć komentarza'); }
  };

  const handleReplySubmit = async (content: TipTapContent, attachments: Attachment[]) => {
    if (onReplySubmit) {
      await onReplySubmit(comment.id, content, attachments);
      setShowReply(false);
    }
  };

  const timeAgo = formatTimeAgo(comment.created_at);

  return (
    <div className={depth > 0 ? 'ml-6 border-l-2 border-htg-card-border pl-3' : ''}>
      <div className="flex gap-2 py-2 group">
        <UserAvatar avatarUrl={comment.author?.avatar_url} displayName={comment.author?.display_name} size="sm" className="shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="bg-htg-surface rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-htg-fg">
                {comment.author?.display_name || 'Anonim'}
              </span>
              {comment.author?.role && comment.author.role !== 'user' && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-htg-sage/10 text-htg-sage font-medium">
                  HTG
                </span>
              )}
            </div>
            <div
              className="text-sm text-htg-fg mt-0.5"
              dangerouslySetInnerHTML={{ __html: renderContent(comment.content) }}
            />
          </div>

          <div className="flex items-center gap-3 mt-0.5 px-1">
            <span className="text-xs text-htg-fg-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
            {comment.is_edited && (
              <span className="text-xs text-htg-fg-muted">edytowano</span>
            )}

            {/* Reply button */}
            {depth < maxDepth && onReplySubmit && (
              <button
                onClick={() => setShowReply(!showReply)}
                className="flex items-center gap-1 text-xs text-htg-fg-muted hover:text-htg-sage transition-colors"
              >
                <Reply className="w-3 h-3" />
                Odpowiedz
              </button>
            )}

            {/* More actions */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-0.5 rounded text-htg-fg-muted hover:text-htg-fg"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {showMenu && (
                <div className="absolute left-0 top-full mt-1 w-36 bg-htg-card border border-htg-card-border rounded-lg shadow-lg z-10">
                  {(isAuthor || canModerate) && (
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-htg-surface"
                    >
                      <Trash2 className="w-3 h-3" />
                      Usuń
                    </button>
                  )}
                  {!isAuthor && (
                    <button
                      onClick={() => { setShowReport(true); setShowMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-htg-fg hover:bg-htg-surface"
                    >
                      <Flag className="w-3 h-3" />
                      Zgłoś
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Inline reply editor */}
          {showReply && (
            <div className="mt-2">
              <PostEditor
                groupId={groupId}
                compact
                placeholder={`Odpowiedz ${comment.author?.display_name || ''}...`}
                onSubmit={handleReplySubmit}
              />
            </div>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {replies.length > 0 && (
        <div>
          {replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              canModerate={canModerate}
              groupId={groupId}
              depth={depth + 1}
              onReplySubmit={onReplySubmit}
            />
          ))}
        </div>
      )}

      {showReport && (
        <ReportModal
          targetType="comment"
          targetId={comment.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

function renderContent(content: CommentWithAuthor['content']): string {
  if (!content?.content) return '';
  return content.content.map(renderNode).join('');
}

function renderNode(node: { type: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }): string {
  if (node.type === 'text') {
    let text = (node.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `<strong>${text}</strong>`;
      if (mark.type === 'italic') text = `<em>${text}</em>`;
      if (mark.type === 'link') text = `<a href="${mark.attrs?.href || ''}" target="_blank" rel="noopener" class="text-htg-sage underline">${text}</a>`;
    }
    return text;
  }
  if (node.type === 'mention') return `<span class="text-htg-sage font-medium">@${node.attrs?.label || ''}</span>`;
  if (node.type === 'paragraph') return (node.content as typeof node[] ?? []).map(renderNode).join('') + ' ';
  return '';
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (min < 1) return 'teraz';
  if (min < 60) return `${min}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}
