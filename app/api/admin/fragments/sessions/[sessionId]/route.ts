import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/admin/fragments/sessions/[sessionId]
 * List all fragments for a session (admin view — includes unpublished sessions).
 *
 * POST /api/admin/fragments/sessions/[sessionId]
 * Diff-upsert: accepts desired full state; computes to_delete/to_update/to_insert.
 * IDs in the payload are STABLE — existing saves with session_fragment_id keep
 * their FK alive as long as the fragment ID is present in the desired array.
 * Removed fragment IDs cause saves to become orphan (FK SET NULL → orphan branch of CHECK).
 *
 * Body: { fragments: DesiredFragment[] }
 * DesiredFragment: {
 *   id?: string         // existing ID to update; omit for new fragments
 *   ordinal: number     // must be unique per session (DEFERRABLE)
 *   start_sec: number
 *   end_sec: number
 *   title: string
 *   title_i18n?: Record<string,string>
 *   description_i18n?: Record<string,string>
 *   is_impulse?: boolean
 *   impulse_order?: number | null
 * }
 */

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data, error } = await db
    .from('session_fragments')
    .select('id, ordinal, start_sec, end_sec, title, title_i18n, description_i18n, is_impulse, impulse_order, created_at, updated_at')
    .eq('session_template_id', sessionId)
    .order('ordinal', { ascending: true });

  if (error) {
    console.error('[admin/fragments] GET failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fragments: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const body = await request.json().catch(() => null);

  if (!Array.isArray(body?.fragments)) {
    return NextResponse.json({ error: 'fragments array required' }, { status: 400 });
  }

  // Validate desired fragments
  const desired = body.fragments as Array<Record<string, unknown>>;
  for (const f of desired) {
    if (typeof f.ordinal !== 'number' || f.ordinal < 1) {
      return NextResponse.json({ error: 'Each fragment must have ordinal >= 1' }, { status: 400 });
    }
    if (typeof f.start_sec !== 'number' || typeof f.end_sec !== 'number' || f.end_sec <= f.start_sec) {
      return NextResponse.json({ error: 'Each fragment must have start_sec < end_sec' }, { status: 400 });
    }
    if (!f.title || typeof f.title !== 'string') {
      return NextResponse.json({ error: 'Each fragment must have a title' }, { status: 400 });
    }
  }

  const db = createSupabaseServiceRole();

  // Verify session exists
  const { data: session } = await db
    .from('session_templates')
    .select('id')
    .eq('id', sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Fetch current fragment IDs
  const { data: current } = await db
    .from('session_fragments')
    .select('id')
    .eq('session_template_id', sessionId);

  const currentIds = new Set((current ?? []).map((f) => f.id as string));
  const desiredWithId = desired.filter((f) => f.id && typeof f.id === 'string');
  const desiredIds = new Set(desiredWithId.map((f) => f.id as string));

  const toDelete = [...currentIds].filter((id) => !desiredIds.has(id));
  const toInsert = desired.filter((f) => !f.id || !currentIds.has(f.id as string));
  const toUpdate = desiredWithId.filter((f) => currentIds.has(f.id as string));

  // ── Step 1: Delete removed fragments ─────────────────────────────────────
  // Saves referencing these fragments become orphan (FK SET NULL).
  if (toDelete.length > 0) {
    const { error: delErr } = await db
      .from('session_fragments')
      .delete()
      .in('id', toDelete)
      .eq('session_template_id', sessionId);

    if (delErr) {
      console.error('[admin/fragments] DELETE failed', delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  // ── Step 2: Update existing fragments ────────────────────────────────────
  // Sort: shrinking fragments (smaller new end_sec) first, expanding ones last.
  // Reduces risk of EXCLUDE constraint violations during range updates.
  const sortedUpdates = [...toUpdate].sort(
    (a, b) => (a.end_sec as number) - (b.end_sec as number),
  );

  for (const f of sortedUpdates) {
    const { error: updErr } = await db
      .from('session_fragments')
      .update({
        ordinal: f.ordinal,
        start_sec: f.start_sec,
        end_sec: f.end_sec,
        title: f.title,
        title_i18n: f.title_i18n ?? {},
        description_i18n: f.description_i18n ?? {},
        is_impulse: f.is_impulse ?? false,
        impulse_order: f.impulse_order ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id as string)
      .eq('session_template_id', sessionId);

    if (updErr) {
      console.error('[admin/fragments] UPDATE failed', updErr, f);
      return NextResponse.json({ error: `Update failed for fragment ${f.id}: ${updErr.message}` }, { status: 422 });
    }
  }

  // ── Step 3: Insert new fragments ─────────────────────────────────────────
  if (toInsert.length > 0) {
    const rows = toInsert.map((f) => ({
      session_template_id: sessionId,
      ordinal: f.ordinal as number,
      start_sec: f.start_sec as number,
      end_sec: f.end_sec as number,
      title: f.title as string,
      title_i18n: (f.title_i18n as object) ?? {},
      description_i18n: (f.description_i18n as object) ?? {},
      is_impulse: (f.is_impulse as boolean) ?? false,
      impulse_order: (f.impulse_order as number | null) ?? null,
      created_by: auth.user.id,
    }));

    const { error: insErr } = await db
      .from('session_fragments')
      .insert(rows);

    if (insErr) {
      console.error('[admin/fragments] INSERT failed', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 422 });
    }
  }

  // Return final state
  const { data: result } = await db
    .from('session_fragments')
    .select('id, ordinal, start_sec, end_sec, title, title_i18n, description_i18n, is_impulse, impulse_order, updated_at')
    .eq('session_template_id', sessionId)
    .order('ordinal', { ascending: true });

  return NextResponse.json({ fragments: result ?? [] });
}
