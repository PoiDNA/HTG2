import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * DELETE /api/live/client-recording/[id]
 *
 * Soft-delete a client recording. Only the owner can call this endpoint —
 * staff deletion is a separate future flow with audit logging (Faza 6).
 *
 * Soft-delete semantics:
 *   - Sets deleted_at = now(), deleted_by = auth.uid()
 *   - Row stays in DB for 14 days (grace period — reversible by service_role
 *     if user changes their mind)
 *   - The cron sweep in /api/cron/process-recordings hard-deletes rows older
 *     than 14 days (also deleting the file from Bunny Storage)
 *   - The token endpoint and page listings filter out deleted_at IS NOT NULL
 *     immediately, so the user experiences the delete as instant
 *
 * This is the RODO art. 17 right-to-erasure implementation. Combined with the
 * FK ON DELETE CASCADE on user_id, a full account deletion also removes all
 * recordings automatically.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Recording id required' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    // Verify ownership. Only the owner can delete — returning 403 for both
    // "not found" and "owned by someone else" so we don't leak existence of
    // arbitrary recording UUIDs (oracle prevention).
    const { data: recording } = await db
      .from('client_recordings')
      .select('id, user_id, deleted_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!recording) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Idempotent: if already deleted, just return OK (don't error on double-click)
    if (recording.deleted_at) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    const { error: updateError } = await db
      .from('client_recordings')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', id);

    if (updateError) {
      console.error('[client-recording-delete] update failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[client-recording-delete] handler error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
