// ============================================================
// Publication system types
// ============================================================

export const PUBLICATION_STATUSES = [
  'raw',
  'editing',
  'edited',
  'mastering',
  'published',
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/** Valid forward transitions. Admin can also reset to any earlier status. */
export const STATUS_TRANSITIONS: Record<PublicationStatus, PublicationStatus | null> = {
  raw: 'editing',
  editing: 'edited',
  edited: 'mastering',
  mastering: 'published',
  published: null,
};

/** Database row from public.session_publications */
export interface SessionPublication {
  id: string;
  live_session_id: string | null;
  session_template_id: string | null;
  monthly_set_id: string | null;
  status: PublicationStatus;
  source_composite_url: string | null;
  source_tracks: TrackInfo[] | null;
  edited_tracks: TrackInfo[] | null;
  edited_composite_url: string | null;
  mastered_url: string | null;
  mastered_bunny_video_id: string | null;
  auto_cleaned_tracks: TrackInfo[] | null;
  auto_mixed_url: string | null;
  auto_edit_status: string | null;
  assigned_editor_id: string | null;
  editor_notes: string | null;
  admin_notes: string | null;
  marked_ready_at: string | null;
  marked_ready_by: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (not always present)
  title?: string;
  monthly_set?: { id: string; title: string; month: string } | null;
  assigned_editor?: { id: string; email: string; display_name: string | null } | null;
}

export interface TrackInfo {
  name: string;
  url: string;
  size?: number;
  duration?: number;
}

/** Stats for the dashboard */
export interface PublicationStats {
  total: number;
  raw: number;
  editing: number;
  edited: number;
  mastering: number;
  published: number;
}

/** Filter parameters for session listing */
export interface SessionFilters {
  month?: string;
  status?: PublicationStatus;
  assignedTo?: string;
}
