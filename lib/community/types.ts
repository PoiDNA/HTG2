/**
 * Community module TypeScript types.
 */

// ─── Database Row Types ───────────────────────────────────────

export type GroupVisibility = 'public' | 'private' | 'staff_only';
export type GroupType = 'topic' | 'post_session' | 'staff';
export type MemberRole = 'member' | 'moderator' | 'admin';
export type PostType = 'native' | 'migrated_from_fb';
export type ReactionTargetType = 'post' | 'comment';
export type NotificationType = 'comment' | 'reaction' | 'mention' | 'new_post' | 'group_invite';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
export type RateLimitAction = 'post' | 'comment' | 'reaction' | 'report';

export interface CommunityGroup {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  visibility: GroupVisibility;
  type: GroupType;
  source_session_id: string | null;
  image_url: string | null;
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommunityMembership {
  id: string;
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
}

export interface CommunityPost {
  id: string;
  group_id: string;
  user_id: string | null;
  content: TipTapContent;
  content_text: string | null;
  attachments: Attachment[];
  type: PostType;
  is_pinned: boolean;
  is_edited: boolean;
  comment_count: number;
  reaction_count: number;
  last_activity_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  group_id: string;
  user_id: string | null;
  parent_id: string | null;
  content: TipTapContent;
  content_text: string | null;
  attachments: Attachment[];
  is_edited: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityReaction {
  id: string;
  user_id: string;
  target_type: ReactionTargetType;
  target_id: string;
  reaction_type: string;
  created_at: string;
}

export interface CommunityNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  target_type: string | null;
  target_id: string | null;
  group_id: string | null;
  grouped_key: string | null;
  actor_ids: string[];
  is_read: boolean;
  created_at: string;
}

export interface CommunityReport {
  id: string;
  reporter_id: string;
  target_type: ReactionTargetType;
  target_id: string;
  group_id: string | null;
  reason: string | null;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// ─── TipTap Content ───────────────────────────────────────────

export interface TipTapContent {
  type: 'doc';
  content: TipTapNode[];
}

export interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
}

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// ─── Attachments ──────────────────────────────────────────────

export type AttachmentStatus = 'processing' | 'ready' | 'failed';

export interface ImageAttachment {
  type: 'image';
  url: string;           // Bunny Storage path (not full URL)
  status: AttachmentStatus;
  metadata: {
    width?: number;
    height?: number;
    size_bytes?: number;
  };
}

export interface AudioAttachment {
  type: 'audio';
  url: string;
  status: AttachmentStatus;
  metadata: {
    duration_sec?: number;
    waveform?: number[];
    transcript?: string;
  };
}

export interface VideoAttachment {
  type: 'video';
  url: string;
  status: AttachmentStatus;
  metadata: {
    provider?: string;
    duration_sec?: number;
    thumbnail_url?: string;
  };
}

export interface LinkPreviewAttachment {
  type: 'link_preview';
  url: string;
  status: AttachmentStatus;
  metadata: {
    title?: string;
    description?: string;
    og_image?: string;
  };
}

export interface PollAttachment {
  type: 'poll';
  url: string;
  status: AttachmentStatus;
  metadata: {
    question: string;
    options: string[];
    multiple?: boolean;
  };
}

export type Attachment =
  | ImageAttachment
  | AudioAttachment
  | VideoAttachment
  | LinkPreviewAttachment
  | PollAttachment;

// ─── API Request/Response Types ───────────────────────────────

export interface PostWithAuthor extends CommunityPost {
  author: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
  user_has_reacted: boolean;
}

export interface CommentWithAuthor extends CommunityComment {
  author: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
}

export interface GroupWithMeta extends CommunityGroup {
  member_count: number;
  is_member: boolean;
  membership_role: MemberRole | null;
  last_post_at: string | null;
}

export interface NotificationWithActor extends CommunityNotification {
  actor: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  group_name: string | null;
  group_slug: string | null;
}

// ─── Cursor Pagination ────────────────────────────────────────

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}
