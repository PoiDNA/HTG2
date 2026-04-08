import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { readSiteSettingString } from '@/lib/site-settings';

const CONSENT_VERSION_KEY = 'htg_meeting_current_consent_version';

// POST /api/htg-meeting/session/self-register
// Body: { sessionId, recordingConsent?: boolean }
//
// recordingConsent=true signals the user accepted the recording consent
// checkbox in the UI. We record timestamp + version so the later consent
// gate in join/route.ts (when composite_recording_started=true) passes.
// Users who skip consent here can still register but will be blocked at
// join time — they must POST /accept-recording-consent first.

const PostBodySchema = z.object({
  sessionId: z.string().uuid(),
  recordingConsent: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = PostBodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid body', details: String(e) }, { status: 400 });
  }
  const { sessionId, recordingConsent } = body;

  const db = createSupabaseServiceRole();

  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select(
      'id, status, meeting_id, htg_meetings!inner(allow_self_register, max_participants, participant_selection)',
    )
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status !== 'waiting') {
    return NextResponse.json({ error: 'Session is not open for registration' }, { status: 400 });
  }

  const meeting = (session as any).htg_meetings;
  if (!meeting.allow_self_register) {
    return NextResponse.json(
      { error: 'Self-registration not allowed for this meeting' },
      { status: 403 },
    );
  }

  const { count } = await db
    .from('htg_meeting_participants')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if ((count ?? 0) >= meeting.max_participants) {
    return NextResponse.json({ error: 'Meeting is full' }, { status: 409 });
  }

  const { data: existing } = await db
    .from('htg_meeting_participants')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ alreadyRegistered: true, status: existing.status });
  }

  const { data: profile } = await db
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .maybeSingle();

  // Capture consent at registration time if checkbox was checked.
  let consentAt: string | null = null;
  let consentVersion: string | null = null;
  if (recordingConsent) {
    consentAt = new Date().toISOString();
    consentVersion = await readSiteSettingString(db, CONSENT_VERSION_KEY, 'v1-2026-04');
  }

  await db.from('htg_meeting_participants').insert({
    session_id: sessionId,
    user_id: user.id,
    is_moderator: false,
    status: 'registered',
    display_name: profile?.display_name ?? null,
    email: profile?.email ?? user.email ?? null,
    recording_consent_at: consentAt,
    recording_consent_version: consentVersion,
  });

  return NextResponse.json({ registered: true, consentRecorded: !!recordingConsent });
}

// DELETE /api/htg-meeting/session/self-register
// Body: { sessionId } — cancel registration

const DeleteBodySchema = z.object({
  sessionId: z.string().uuid(),
});

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = DeleteBodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid body', details: String(e) }, { status: 400 });
  }
  const { sessionId } = body;

  const db = createSupabaseServiceRole();

  await db
    .from('htg_meeting_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'registered'); // can only cancel if not yet approved/joined

  return NextResponse.json({ cancelled: true });
}
