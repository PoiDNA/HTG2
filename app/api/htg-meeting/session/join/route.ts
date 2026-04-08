import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { createLiveKitToken } from '@/lib/live/livekit';
import { readSiteSettingString } from '@/lib/site-settings';

const CONSENT_VERSION_KEY = 'htg_meeting_current_consent_version';

// POST /api/htg-meeting/session/join
//
// PR #1 (plan v8): token FIRST, then DB update. Sanitize displayName (strip ':').
// Consent gate PRZED admin bypass check — admins skip the gate with audit.
// Consent gate only activates when session.composite_recording_started=true,
// which is not yet set until PR #4 adds the recording pipeline.

const BodySchema = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid body', details: String(e) }, { status: 400 });
  }
  const { sessionId } = body;

  const db = createSupabaseServiceRole();

  // Load session (includes composite_recording_started from migration 052)
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status === 'ended') return NextResponse.json({ error: 'Session ended' }, { status: 400 });

  const isAdmin = isAdminEmail(user.email ?? '');

  // Load participant record
  const { data: existingParticipant } = await db
    .from('htg_meeting_participants')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  let participant = existingParticipant;

  // Non-admin must be in participants list
  if (!isAdmin && !participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  // Admin bypass consent gate — audited BEFORE proceeding
  if (isAdmin && session.composite_recording_started) {
    await db.from('admin_audit_log').insert({
      admin_id: user.id,
      action: 'htg_admin_bypass_consent_gate',
      details: {
        session_id: sessionId,
        email: user.email,
        reason: 'admin email bypassed consent gate for active recording',
      },
    });
  } else if (!isAdmin && session.composite_recording_started) {
    // Non-admin consent gate: must have valid consent with current version
    const currentVersion = await readSiteSettingString(db, CONSENT_VERSION_KEY, 'v1-2026-04');
    const hasValidConsent =
      participant?.recording_consent_at &&
      participant?.recording_consent_version === currentVersion;

    if (!hasValidConsent) {
      return NextResponse.json(
        {
          error: 'Recording consent required',
          requiresConsent: true,
          currentConsentVersion: currentVersion,
          acceptUrl: `/api/htg-meeting/session/${sessionId}/accept-recording-consent`,
        },
        { status: 412 },
      );
    }
  }

  // Sanitize displayName: strip colons so identity format "userId:displayName" parses cleanly.
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const rawDisplayName =
    participant?.display_name ??
    profile?.display_name ??
    profile?.email ??
    user.email ??
    'Uczestnik';
  const safeDisplayName = rawDisplayName.replace(/:/g, '_');

  const isModerator = participant?.is_moderator ?? (session.moderator_id === user.id);

  // v8: Token FIRST — DB update happens AFTER successful token generation.
  // Prevents "ghost joined" state if LiveKit token generation throws.
  const identity = `${user.id}:${safeDisplayName}`;
  const token = await createLiveKitToken(
    identity,
    session.room_name,
    isModerator,
    safeDisplayName,
  );

  // Token succeeded — now update/insert participant row with status='joined'
  if (isAdmin && !participant) {
    const { data: newP } = await db
      .from('htg_meeting_participants')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        display_name: safeDisplayName,
        email: user.email,
        is_moderator: session.moderator_id === user.id,
        status: 'joined',
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();
    participant = newP;
  } else if (participant) {
    await db
      .from('htg_meeting_participants')
      .update({
        display_name: safeDisplayName,
        status: 'joined',
        joined_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .eq('user_id', user.id);
  }

  return NextResponse.json({
    token,
    url: process.env.LIVEKIT_URL,
    isModerator,
  });
}
