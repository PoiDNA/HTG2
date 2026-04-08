import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { readSiteSettingString } from '@/lib/site-settings';

const CONSENT_VERSION_KEY = 'htg_meeting_current_consent_version';

// POST /api/htg-meeting/session/[id]/accept-recording-consent
//
// User accepts recording consent for this session. Writes timestamp + version
// to their existing htg_meeting_participants row.
//
// IMPORTANT: UPDATE only, never UPSERT. Consent can only be accepted by users
// who have already been registered/approved for this session — enforcing the
// full workflow self-register → approve → consent → join. An UPSERT here would
// let anyone with a valid login create a participant row and dodge the approval step.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();

  const currentVersion = await readSiteSettingString(db, CONSENT_VERSION_KEY, 'v1-2026-04');
  const nowIso = new Date().toISOString();

  // UPDATE only — must match an existing participant row in an allowed status.
  const { data: updated, error } = await db
    .from('htg_meeting_participants')
    .update({
      recording_consent_at: nowIso,
      recording_consent_version: currentVersion,
    })
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .in('status', ['registered', 'approved', 'joined'])
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      {
        error: 'Not registered for this session. Register first, then accept consent.',
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    consentVersion: currentVersion,
    acceptedAt: nowIso,
  });
}
