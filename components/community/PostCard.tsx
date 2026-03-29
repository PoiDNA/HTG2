'use client';

import { useState } from 'react';
import { MessageCircle, Pin, MoreHorizontal, Trash2, Flag, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { UserAvatar } from './UserAvatar';
import { ReactionButton } from './ReactionButton';
import { CommentSection } from './CommentSection';
import { MediaGallery } from './MediaGallery';
import { VoicePlayer } from './VoicePlayer';
import { LinkPreview } from './LinkPreview';
import { PollDisplay } from './PollDisplay';
import { ReportModal } from './ReportModal';
import type { PostWithAuthor, Attachment, AudioAttachment, LinkPreviewAttachment } from '@/lib/community/types';

interface PostCardProps {
  post: PostWithAuthor;
  groupId: string;
  currentUserId: string;
  canModerate: boolean;
}

export function PostCard({ post, groupId, currentUserId, canModerate }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  if (isDeleted) return null;

  const isAuthor = post.user_id === currentUserId;
  const attachments = (post.attachments ?? []) as Attachment[];
  const imageAttachments = attachments.filter(a => a.type === 'image');
  const audioAttachments = attachments.filter(a => a.type === 'audio') as AudioAttachment[];
  const linkPreviews = attachments.filter(a => a.type === 'link_preview') as LinkPreviewAttachment[];
  const pollAttachment = attachments.find(a => a.type === 'poll') as (Attachment & { metadata: { question: string; options: string[] } }) | undefined;
  const timeAgo = formatTimeAgo(post.created_at);

  const handleDelete = async () => {
    if (!confirm('Czy na pewno chcesz usunąć ten post?')) return;
    try {
      const res = await fetch(`/api/community/posts/${post.id}`, { method: 'DELETE' });
      if (res.ok) { setIsDeleted(true); toast.success('Post usunięty'); }
      else toast.error('Nie udało się usunąć posta');
    } catch { toast.error('Nie udało się usunąć posta'); }
  };

  const handlePin = async () => {
    try {
      const res = await fetch(`/api/community/posts/${post.id}/pin`, { method: 'PATCH' });
      if (!res.ok) toast.error('Nie udało się przypiąć posta');
    } catch { toast.error('Nie udało się przypiąć posta'); }
    setShowMenu(false);
  };

  return (
    <article className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-0">
        <div className="flex items-center gap-3">
          <UserAvatar avatarUrl={post.author?.avatar_url} displayName={post.author?.display_name} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-htg-fg text-sm">
                {post.author?.display_name || 'Anonim'}
              </span>
              {post.author?.role && post.author.role !== 'user' && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-htg-sage/10 text-htg-sage font-medium">
                  HTG Team
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-htg-fg-muted">
              <Clock className="w-3 h-3" />
              <span>{timeAgo}</span>
              {post.is_edited && <span>· edytowano</span>}
              {post.type === 'migrated_from_fb' && <span>· z Facebooka</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {post.is_pinned && (
            <Pin className="w-4 h-4 text-htg-warm" />
          )}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-htg-card border border-htg-card-border rounded-lg shadow-lg z-10">
                {(isAuthor || canModerate) && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-htg-surface transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Usuń
                  </button>
                )}
                {canModerate && (
                  <button
                    onClick={handlePin}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-htg-fg hover:bg-htg-surface transition-colors"
                  >
                    <Pin className="w-4 h-4" />
                    {post.is_pinned ? 'Odepnij' : 'Przypnij'}
                  </button>
                )}
                {!isAuthor && (
                  <button
                    onClick={() => { setShowReport(true); setShowMenu(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-htg-fg hover:bg-htg-surface transition-colors"
                  >
                    <Flag className="w-4 h-4" />
                    Zgłoś
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <div
          className="prose prose-sm max-w-none text-htg-fg"
          dangerouslySetInnerHTML={{ __html: renderTipTapContent(post.content) }}
        />
      </div>

      {/* Image attachments */}
      {imageAttachments.length > 0 && (
        <MediaGallery attachments={imageAttachments} />
      )}

      {/* Voice notes */}
      {audioAttachments.map((att, i) => (
        <div key={`audio-${i}`} className="px-4 pb-3">
          <VoicePlayer attachment={att} />
        </div>
      ))}

      {/* Link previews */}
      {linkPreviews.map((att, i) => (
        <LinkPreview key={`link-${i}`} attachment={att} />
      ))}

      {/* Poll */}
      {pollAttachment && (
        <PollDisplay
          postId={post.id}
          question={pollAttachment.metadata.question}
          options={pollAttachment.metadata.options}
        />
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-htg-card-border">
        <ReactionButton
          targetType="post"
          targetId={post.id}
          initialReacted={post.user_has_reacted}
          initialCount={post.reaction_count}
        />

        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span>{post.comment_count > 0 ? post.comment_count : ''}</span>
          <span className="hidden sm:inline">
            {post.comment_count === 0 ? 'Komentuj' : ''}
          </span>
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <CommentSection
          postId={post.id}
          groupId={groupId}
          currentUserId={currentUserId}
          canModerate={canModerate}
        />
      )}

      {/* Report modal */}
      {showReport && (
        <ReportModal
          targetType="post"
          targetId={post.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </article>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function renderTipTapContent(content: PostWithAuthor['content']): string {
  if (!content || !content.content) return '';

  return content.content
    .map(node => renderNode(node))
    .join('');
}

function renderNode(node: { type: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }): string {
  if (node.type === 'text') {
    let text = escapeHtml(node.text || '');
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `<strong>${text}</strong>`;
      if (mark.type === 'italic') text = `<em>${text}</em>`;
      if (mark.type === 'link') text = `<a href="${escapeHtml(String(mark.attrs?.href || ''))}" target="_blank" rel="noopener" class="text-htg-sage underline">${text}</a>`;
    }
    return text;
  }
  if (node.type === 'mention') {
    return `<span class="text-htg-sage font-medium">@${escapeHtml(String(node.attrs?.label || ''))}</span>`;
  }
  if (node.type === 'paragraph') {
    const inner = (node.content as typeof node[] ?? []).map(renderNode).join('');
    return `<p>${inner || '<br>'}</p>`;
  }
  if (node.type === 'bulletList') {
    const inner = (node.content as typeof node[] ?? []).map(renderNode).join('');
    return `<ul>${inner}</ul>`;
  }
  if (node.type === 'listItem') {
    const inner = (node.content as typeof node[] ?? []).map(renderNode).join('');
    return `<li>${inner}</li>`;
  }
  return '';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'teraz';
  if (minutes < 60) return `${minutes} min temu`;
  if (hours < 24) return `${hours} godz. temu`;
  if (days < 7) return `${days} dn. temu`;
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}
