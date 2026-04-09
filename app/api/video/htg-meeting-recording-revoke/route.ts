import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { auditHtgRecording } from '@/lib/live/meeting-constants';

const RevokeRequestSchema = z.object({
  recordingId: z.string().uuid('recordingId must be a valid UUID'),
  reason: z.string().max(500, 'reason too long').optional(),
});

/**
 * POST /api/video/htg-meeting-recording-revoke
 *
 * Self-service: user revokes their own access to an HTG Meeting recording.
 * Mirrors booking-recording-revoke pattern — service-role-only write so RLS
 * cannot be used by client to re-grant (un-revoke) after revoke.
 *
 * Body: { recordingId: string, reason?: string }
 *
 * Behavior:
 *  - Requires authenticated user
 *  - Only user's OWN row (service role validates user_id matches auth.uid())
 *  - Sets revoked_at, revoked_by=self, revoked_reason
 *  - Clears any active_streams row for this (user, recording)
 *  - Audit access_revoked
 *
 * After revoke the user's next token request will 403; per plan there is NO
 * self un-revoke path (must contact admin). Migration 036 mirror policy
 * prevents RLS bypass.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = RevokeRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { recordingId, reason } = parsed.data;

    const db = createSupabaseServiceRole();

    // Verify the access row exists and belongs to this user
    const { data: access } = await db
      .from('htg_meeting_recording_access' as any)
      .select('id, revoked_at')
      .eq('recording_id', recordingId)
      .eq('user_id', user.id)
      .maybeSingle();

    const acc = access as { id?: string; revoked_at?: string | null } | null;
    if (!acc) {
      return NextResponse.json({ error: 'Access row not found' }, { status: 404 });
    }

    if (acc.revoked_at) {
      // Idempotent — already revoked, no-op
      return NextResponse.json({ ok: true, alreadyRevoked: true });
    }

    // Revoke
    const now = new Date().toISOString();
    await db
      .from('htg_meeting_recording_access' as any)
      .update({
        revoked_at: now,
        revoked_by: user.id,
        revoked_reason: reason ?? 'user_self_revoke',
      })
      .eq('id', acc.id);

    // Clear any active stream so device-limit doesn't wedge future grants
    await db
      .from('htg_meeting_active_streams' as any)
      .delete()
      .eq('recording_id', recordingId)
      .eq('user_id', user.id);

    await auditHtgRecording(db, recordingId, null, 'access_revoked', {
      user_id: user.id,
      reason: reason ?? 'user_self_revoke',
      self: true,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('[htg-revoke] error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
