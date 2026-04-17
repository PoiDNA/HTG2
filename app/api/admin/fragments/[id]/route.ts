import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * PATCH /api/admin/fragments/[id]
 * Update a single fragment. Commonly used for:
 *   - Toggling is_impulse + impulse_order (Impulse curation)
 *   - Editing title/title_i18n without a full session rewrite
 *
 * DELETE /api/admin/fragments/[id]
 * Remove a single fragment. Saves referencing it become orphan (FK SET NULL).
 */

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined)          updates.title = String(body.title).trim().slice(0, 200);
  if (body.title_i18n !== undefined)     updates.title_i18n = body.title_i18n;
  if (body.description_i18n !== undefined) updates.description_i18n = body.description_i18n;
  if (body.is_impulse !== undefined)     updates.is_impulse = Boolean(body.is_impulse);
  if (body.impulse_order !== undefined)  updates.impulse_order = body.impulse_order ?? null;
  if (body.ordinal !== undefined)        updates.ordinal = Number(body.ordinal);
  if (body.start_sec !== undefined)      updates.start_sec = Number(body.start_sec);
  if (body.end_sec !== undefined)        updates.end_sec = Number(body.end_sec);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const db = createSupabaseServiceRole();
  const { data, error } = await db
    .from('session_fragments')
    .update(updates)
    .eq('id', id)
    .select('id, ordinal, start_sec, end_sec, title, title_i18n, description_i18n, is_impulse, impulse_order, updated_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Fragment not found' }, { status: 404 });
    }
    if (error.code === 'check_violation' || error.code === '23P01') {
      return NextResponse.json({ error: 'Range overlap or constraint violation: ' + error.message }, { status: 422 });
    }
    console.error('[admin/fragments] PATCH failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fragment: data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const db = createSupabaseServiceRole();

  // Count saves that will become orphan (informational — still allowed)
  const { count: saveCount } = await db
    .from('user_fragment_saves')
    .select('id', { count: 'exact', head: true })
    .eq('session_fragment_id', id);

  const { error } = await db
    .from('session_fragments')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Fragment not found' }, { status: 404 });
    }
    console.error('[admin/fragments] DELETE failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orphanedSaves: saveCount ?? 0 });
}
