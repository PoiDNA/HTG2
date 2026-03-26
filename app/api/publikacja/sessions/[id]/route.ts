import { NextRequest, NextResponse } from 'next/server';
import { requirePublication } from '@/lib/publication/auth';
import { PUBLICATION_STATUSES } from '@/lib/publication/types';
import type { PublicationStatus } from '@/lib/publication/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;

  const { id } = await params;

  const { data: session, error } = await supabase
    .from('session_publications')
    .select(`
      *,
      monthly_set:monthly_sets(id, title, month),
      assigned_editor:profiles!session_publications_assigned_editor_id_fkey(id, email, display_name)
    `)
    .eq('id', id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Non-admin editors can only see assigned or unassigned sessions
  if (!isAdmin && session.assigned_editor_id && session.assigned_editor_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ session });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;

  const { id } = await params;
  const body = await request.json();

  // Build update object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};

  // Status change
  if (body.status) {
    const newStatus = body.status as PublicationStatus;
    if (!PUBLICATION_STATUSES.includes(newStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Get current session
    const { data: current } = await supabase
      .from('session_publications')
      .select('status, assigned_editor_id')
      .eq('id', id)
      .single();

    if (!current) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Non-admin can only advance forward
    const currentIdx = PUBLICATION_STATUSES.indexOf(current.status as PublicationStatus);
    const newIdx = PUBLICATION_STATUSES.indexOf(newStatus);

    if (!isAdmin && newIdx < currentIdx) {
      return NextResponse.json({ error: 'Cannot go backwards' }, { status: 403 });
    }

    // Non-admin can only modify their own assigned sessions
    if (!isAdmin && current.assigned_editor_id && current.assigned_editor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    update.status = newStatus;

    // Auto-assign editor when transitioning to 'editing'
    if (newStatus === 'editing' && !current.assigned_editor_id) {
      update.assigned_editor_id = user.id;
    }

    if (newStatus === 'edited') {
      update.marked_ready_at = new Date().toISOString();
      update.marked_ready_by = user.id;
    }

    if (newStatus === 'published') {
      update.published_at = new Date().toISOString();
      update.published_by = user.id;
    }
  }

  // Other allowed fields
  if (body.editor_notes !== undefined) update.editor_notes = body.editor_notes;
  if (body.admin_notes !== undefined && isAdmin) update.admin_notes = body.admin_notes;
  if (body.source_tracks !== undefined) update.source_tracks = body.source_tracks;
  if (body.edited_tracks !== undefined) update.edited_tracks = body.edited_tracks;
  if (body.edited_composite_url !== undefined) update.edited_composite_url = body.edited_composite_url;
  if (body.assigned_editor_id !== undefined && isAdmin) update.assigned_editor_id = body.assigned_editor_id;
  if (body.auto_edit_status !== undefined) update.auto_edit_status = body.auto_edit_status;
  if (body.auto_cleaned_tracks !== undefined) update.auto_cleaned_tracks = body.auto_cleaned_tracks;
  if (body.auto_mixed_url !== undefined) update.auto_mixed_url = body.auto_mixed_url;
  if (body.mastered_url !== undefined) update.mastered_url = body.mastered_url;

  update.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('session_publications')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: updated });
}
