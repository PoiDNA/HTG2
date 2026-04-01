'use server';

import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

async function requireAdmin(): Promise<string | null> {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) return null;
  return user.id;
}

export async function logAdminPageView(page: string) {
  try {
    const adminId = await requireAdmin();
    if (!adminId) return;

    const db = createSupabaseServiceRole();
    await db.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'page_view',
      details: { page },
    });
  } catch {
    // Non-blocking
  }
}

export async function assignRecordingAccess(
  recordingId: string,
  email: string,
): Promise<{ error?: string; displayName?: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: 'Brak uprawnień' };

  const db = createSupabaseServiceRole();

  // Find user by email in profiles
  const { data: profile } = await db
    .from('profiles')
    .select('id, display_name, email')
    .eq('email', email)
    .maybeSingle();

  if (!profile) {
    return { error: `Nie znaleziono użytkownika: ${email}` };
  }

  // Check existing access
  const { data: existing } = await db
    .from('booking_recording_access')
    .select('id, revoked_at')
    .eq('recording_id', recordingId)
    .eq('user_id', profile.id)
    .maybeSingle();

  if (existing && !existing.revoked_at) {
    return { error: 'Użytkownik ma już dostęp do tego nagrania' };
  }

  if (existing && existing.revoked_at) {
    // Re-grant previously revoked access
    await db
      .from('booking_recording_access')
      .update({ revoked_at: null, revoked_by: null, revoked_reason: null })
      .eq('id', existing.id);
  } else {
    await db.from('booking_recording_access').insert({
      recording_id: recordingId,
      user_id: profile.id,
      granted_reason: 'admin_grant',
    });
  }

  // Update confidence if manual_review → admin_assigned
  await db
    .from('booking_recordings')
    .update({ import_confidence: 'admin_assigned' })
    .eq('id', recordingId)
    .eq('import_confidence', 'manual_review');

  // Audit
  await db.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'assign_recording',
    details: { recording_id: recordingId, target_email: email, target_user_id: profile.id },
  });

  return { displayName: profile.display_name ?? email };
}

export async function removeRecordingAccess(
  recordingId: string,
  userId: string,
): Promise<{ error?: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: 'Brak uprawnień' };

  const db = createSupabaseServiceRole();

  const { error } = await db
    .from('booking_recording_access')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: adminId,
      revoked_reason: 'admin_removed',
    })
    .eq('recording_id', recordingId)
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) return { error: error.message };

  await db.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'remove_recording_access',
    details: { recording_id: recordingId, target_user_id: userId },
  });

  return {};
}
