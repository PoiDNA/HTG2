'use server';

// Server actions do przydzielania/usuwania dostępu do nagrań fazy sesja
// z poziomu panelu admin (/konto/admin/sesje) i staff (/prowadzacy/sesje).
//
// W odróżnieniu od istniejącego admin/nagrania-klientow/actions.ts (admin-only),
// ten moduł obsługuje też staff (practitioner + assistant) z egzekwowaniem
// scope poprzez staff_members.session_types.
//
// Cały hard-auth + scope resolver jest w lib/admin/require-playback-actor.ts
// (jedno źródło prawdy, zero fallback per endpoint).

import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import {
  resolveStaffPlaybackScope,
  isSessionTypeInScope,
  type PlaybackScope,
} from '@/lib/admin/require-playback-actor';

export type AssignResult =
  | { status: 'added'; displayName?: string }
  | { status: 'already_had'; displayName?: string }
  | { status: 'regranted'; displayName?: string }
  | { status: 'user_not_found'; email: string }
  | { status: 'scope_violation' }
  | { status: 'unauthorized' }
  | { status: 'invalid_recording' }
  | { status: 'error'; error: string };

export type PerEmailResult = AssignResult & { email: string };

type RecordingMeta = {
  id: string;
  session_type: string;
  recording_phase: string | null;
  status: string;
};

type Actor = {
  userId: string;
  email: string;
  scope: PlaybackScope;
};

// ─── internal helpers ─────────────────────────────────────────────────

async function getActor(): Promise<Actor | null> {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;

  const db = createSupabaseServiceRole();
  const scope = await resolveStaffPlaybackScope(user, db);
  if (!scope) return null;

  return { userId: user.id, email: user.email ?? '', scope };
}

async function getValidatedRecording(
  recordingId: string,
  scope: PlaybackScope,
  db: ReturnType<typeof createSupabaseServiceRole>,
): Promise<RecordingMeta | { error: AssignResult }> {
  const { data: recording } = await db
    .from('booking_recordings')
    .select('id, session_type, recording_phase, status')
    .eq('id', recordingId)
    .maybeSingle();

  if (!recording) {
    return { error: { status: 'invalid_recording' } };
  }

  // Hard walidacja fazy i statusu — UI filter to nie zabezpieczenie.
  if (recording.recording_phase !== 'sesja' || recording.status !== 'ready') {
    return { error: { status: 'invalid_recording' } };
  }

  if (!isSessionTypeInScope(scope, recording.session_type)) {
    return { error: { status: 'scope_violation' } };
  }

  return recording as RecordingMeta;
}

function actorRoleForAudit(scope: PlaybackScope): 'admin' | 'practitioner' | 'assistant' {
  return scope.role;
}

async function assignEmailInternal(params: {
  db: ReturnType<typeof createSupabaseServiceRole>;
  actor: Actor;
  recordingId: string;
  email: string;
  via: 'manual' | 'bulk_preset';
}): Promise<AssignResult> {
  const { db, actor, recordingId, email, via } = params;

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return { status: 'user_not_found', email };
  }

  // Fetch profile by exact email (case-insensitive)
  const { data: profile } = await db
    .from('profiles')
    .select('id, display_name, email')
    .ilike('email', trimmedEmail)
    .maybeSingle();

  if (!profile) {
    return { status: 'user_not_found', email };
  }

  // Check existing access
  const { data: existing } = await db
    .from('booking_recording_access')
    .select('id, revoked_at')
    .eq('recording_id', recordingId)
    .eq('user_id', profile.id)
    .maybeSingle();

  let resultStatus: 'added' | 'already_had' | 'regranted';

  if (existing && !existing.revoked_at) {
    return { status: 'already_had', displayName: profile.display_name ?? profile.email };
  }

  if (existing && existing.revoked_at) {
    const { error: updateError } = await db
      .from('booking_recording_access')
      .update({ revoked_at: null, revoked_by: null, revoked_reason: null })
      .eq('id', existing.id);
    if (updateError) {
      return { status: 'error', error: updateError.message };
    }
    resultStatus = 'regranted';
  } else {
    const { error: insertError } = await db
      .from('booking_recording_access')
      .insert({
        recording_id: recordingId,
        user_id: profile.id,
        granted_reason: 'admin_grant',
      });
    if (insertError) {
      return { status: 'error', error: insertError.message };
    }
    resultStatus = 'added';
  }

  // Audit log — admin_id holds actor's user_id regardless of role semantics
  await db.from('admin_audit_log').insert({
    admin_id: actor.userId,
    action: 'assign_recording',
    details: {
      recording_id: recordingId,
      target_user_id: profile.id,
      target_email: profile.email,
      actor_email: actor.email,
      actor_role: actorRoleForAudit(actor.scope),
      via,
    },
  });

  return { status: resultStatus, displayName: profile.display_name ?? profile.email };
}

// ─── public server actions ────────────────────────────────────────────

export async function assignRecordingForActor(
  recordingId: string,
  email: string,
): Promise<AssignResult> {
  const actor = await getActor();
  if (!actor) return { status: 'unauthorized' };

  const db = createSupabaseServiceRole();
  const recording = await getValidatedRecording(recordingId, actor.scope, db);
  if ('error' in recording) return recording.error;

  return assignEmailInternal({ db, actor, recordingId, email, via: 'manual' });
}

export async function bulkAssignRecordingForActor(
  recordingId: string,
  emails: string[],
): Promise<{ results: PerEmailResult[]; status?: 'unauthorized' | 'scope_violation' | 'invalid_recording' }> {
  const actor = await getActor();
  if (!actor) return { results: [], status: 'unauthorized' };

  const db = createSupabaseServiceRole();
  const recording = await getValidatedRecording(recordingId, actor.scope, db);
  if ('error' in recording) {
    const err = recording.error;
    if (err.status === 'scope_violation' || err.status === 'invalid_recording') {
      return { results: [], status: err.status };
    }
    return { results: [] };
  }

  // Per-email loop — shared actor + recording validation done once above.
  const results: PerEmailResult[] = [];
  for (const email of emails) {
    const res = await assignEmailInternal({ db, actor, recordingId, email, via: 'bulk_preset' });
    results.push({ ...res, email });
  }

  return { results };
}

export async function removeRecordingAccessForActor(
  recordingId: string,
  targetUserId: string,
): Promise<{ error?: string; status?: 'unauthorized' | 'scope_violation' | 'invalid_recording' }> {
  const actor = await getActor();
  if (!actor) return { status: 'unauthorized' };

  const db = createSupabaseServiceRole();
  const recording = await getValidatedRecording(recordingId, actor.scope, db);
  if ('error' in recording) {
    const err = recording.error;
    if (err.status === 'scope_violation' || err.status === 'invalid_recording') {
      return { status: err.status };
    }
    return { error: 'Nagranie niedostępne' };
  }

  const { error } = await db
    .from('booking_recording_access')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: actor.userId,
      revoked_reason: 'admin_removed',
    })
    .eq('recording_id', recordingId)
    .eq('user_id', targetUserId)
    .is('revoked_at', null);

  if (error) return { error: error.message };

  await db.from('admin_audit_log').insert({
    admin_id: actor.userId,
    action: 'remove_recording_access',
    details: {
      recording_id: recordingId,
      target_user_id: targetUserId,
      actor_email: actor.email,
      actor_role: actorRoleForAudit(actor.scope),
    },
  });

  return {};
}
