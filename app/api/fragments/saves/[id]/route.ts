import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * PATCH /api/fragments/saves/[id]
 * Update user metadata on a save: is_favorite, category_id, note.
 * (fragment bounds are immutable after creation)
 *
 * DELETE /api/fragments/saves/[id]
 * Delete a save. User's personal data — no cascade effects on fragments.
 */

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (body.is_favorite !== undefined) updates.is_favorite = Boolean(body.is_favorite);
  if (body.note !== undefined)        updates.note = body.note ?? null;
  // category_id: allow null (unassign), string (assign), or keep current
  if ('category_id' in body)          updates.category_id = body.category_id ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_fragment_saves')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, is_favorite, category_id, note, updated_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Save not found' }, { status: 404 });
    }
    if (error.code === 'check_violation' || error.code === '23514') {
      return NextResponse.json({ error: 'Cannot place recording fragment in shared category' }, { status: 422 });
    }
    console.error('[saves] PATCH failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ save: data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from('user_fragment_saves')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Save not found' }, { status: 404 });
    }
    console.error('[saves] DELETE failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
