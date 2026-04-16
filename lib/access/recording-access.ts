/**
 * lib/access/recording-access.ts
 *
 * Shared booking-recording access logic extracted from
 * app/api/video/booking-recording-token/route.ts.
 *
 * Used by:
 *   - app/api/video/booking-recording-token/route.ts  (original path)
 *   - app/api/video/fragment-token/route.ts           (booking-recording branch)
 *
 * HARD INVARIANTS (must be maintained by every caller):
 *   1. Rate-limit check + logRateLimitAction run in the ROUTE, immediately
 *      after getUser(), BEFORE calling checkRecordingAccess. Never inside
 *      this helper. Rate limit is pinned to user.id (session subject), not
 *      effectiveUserId.
 *   2. This helper does NOT sign URLs, NOT upsert active_streams, NOT compute
 *      token TTL. Those remain in the route after a successful return.
 *   3. Impersonation: caller resolves effectiveUserId and isDirectAdmin before
 *      calling. This helper does not read cookies.
 *
 * Return shape:
 *   { ok: true, recording: RecordingRow }  — caller may proceed to sign URL
 *   { ok: false, status: number, body: object } — caller returns this response
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStaffPlaybackScope, isSessionTypeInScope } from '@/lib/admin/require-playback-actor';

export interface RecordingRow {
  bunny_video_id:      string | null;
  bunny_library_id:    string | null;
  backup_storage_path: string | null;
  source_url:          string | null;
  status:              string;
  expires_at:          string | null;
  session_type:        string | null;
  session_date:        string | null;
  legal_hold:          boolean;
  duration_seconds:    number | null;
  recording_phase:     string | null;
}

export type RecordingAccessResult =
  | { ok: true;  recording: RecordingRow }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Validates access to a booking recording.
 *
 * Steps (1:1 with booking-recording-token, excluding rate-limit and media signing):
 *   1. Recording lookup
 *   2. Phase guard (non-sesja → isDirectAdmin only)
 *   3. Access row check (skipped for staff/admin bypass when not impersonating)
 *   4. Para revoke check (natalia_para sessions)
 *   5. Status check (must be 'ready')
 *   6. Hybrid retention (expires_at snapshot + global policy from site_settings)
 *
 * @param recordingId        - booking_recordings.id
 * @param effectiveUserId    - user.id or impersonated user.id
 * @param isDirectAdmin      - isAdminEmail(user.email) && !impersonateId
 * @param isImpersonating    - !!impersonateId (disables staff scope bypass)
 * @param requestingUser     - raw auth.users user (for resolveStaffPlaybackScope)
 * @param db                 - service-role SupabaseClient
 */
export async function checkRecordingAccess(params: {
  recordingId:      string;
  effectiveUserId:  string;
  isDirectAdmin:    boolean;
  isImpersonating:  boolean;
  requestingUser:   { id: string; email?: string | null };
  db:               SupabaseClient;
}): Promise<RecordingAccessResult> {
  const {
    recordingId,
    effectiveUserId,
    isDirectAdmin,
    isImpersonating,
    requestingUser,
    db,
  } = params;

  // ── Step 1: Recording lookup ─────────────────────────────────────────────
  const { data: recording } = await db
    .from('booking_recordings')
    .select(
      'bunny_video_id, bunny_library_id, backup_storage_path, source_url, ' +
      'status, expires_at, session_type, session_date, legal_hold, ' +
      'duration_seconds, recording_phase',
    )
    .eq('id', recordingId)
    .single();

  if (!recording) {
    return {
      ok: false,
      status: 200,
      body: {
        allowed: false,
        title: 'Nagranie niedostępne',
        message: 'Nagranie nie zostało odnalezione w systemie.',
      },
    };
  }

  // Cast to RecordingRow — some columns (recording_phase, backup_storage_path)
  // were added in later migrations and may not appear in the Supabase-generated
  // types. Same pattern as the original booking-recording-token/route.ts.
  const rec = recording as unknown as RecordingRow;

  const isNonSesja = rec.recording_phase && rec.recording_phase !== 'sesja';

  // Staff/admin bypass scope (disabled when impersonating)
  const scope = isImpersonating
    ? null
    : await resolveStaffPlaybackScope(requestingUser as Parameters<typeof resolveStaffPlaybackScope>[0], db);

  // ── Step 2: Phase guard ──────────────────────────────────────────────────
  // Non-sesja recordings (wstep/podsumowanie) are admin-only.
  if (isNonSesja) {
    if (!isDirectAdmin) {
      return {
        ok: false,
        status: 200,
        body: {
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'To nagranie nie jest dostępne dla użytkowników.',
        },
      };
    }
    // Direct admin: skip access row check (admin-only material has no access rows)
  } else {
    // ── Step 3: Access row check ───────────────────────────────────────────
    const hasStaffBypass = isSessionTypeInScope(scope, rec.session_type ?? '');

    if (!hasStaffBypass) {
      const { data: access } = await db
        .from('booking_recording_access')
        .select('id, revoked_at')
        .eq('recording_id', recordingId)
        .eq('user_id', effectiveUserId)
        .maybeSingle();

      if (!access || access.revoked_at) {
        return {
          ok: false,
          status: 200,
          body: {
            allowed: false,
            title: 'Brak dostępu',
            message: 'Nie masz dostępu do tego nagrania.',
          },
        };
      }
    }
  }

  // ── Step 4: Para revoke ──────────────────────────────────────────────────
  // Partner-initiated revoke blocks ALL parties (including admin/staff preview).
  if (rec.session_type === 'natalia_para') {
    const { data: partnerRevoked } = await db
      .from('booking_recording_access')
      .select('id')
      .eq('recording_id', recordingId)
      .not('revoked_at', 'is', null)
      .in('granted_reason', ['booking_client', 'companion'])
      .limit(1)
      .maybeSingle();

    if (partnerRevoked) {
      return {
        ok: false,
        status: 200,
        body: {
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'Dostęp do nagrania został wstrzymany. Nasz zespół skontaktuje się w ciągu 48h.',
          supportContact: 'htg@htg.cyou',
        },
      };
    }
  }

  // ── Step 5: Status check ─────────────────────────────────────────────────
  if (rec.status !== 'ready') {
    return {
      ok: false,
      status: 200,
      body: {
        allowed: false,
        title: rec.status === 'expired' ? 'Nagranie wygasło' : 'Nagranie w przygotowaniu',
        message:
          rec.status === 'expired'
            ? 'Nagranie wygasło'
            : 'Nagranie jest w trakcie przygotowania. Spróbuj ponownie za kilka minut.',
      },
    };
  }

  // ── Step 6: Hybrid retention ─────────────────────────────────────────────
  if (!rec.legal_hold) {
    const now = new Date();

    if (rec.expires_at && new Date(rec.expires_at) < now) {
      return {
        ok: false,
        status: 200,
        body: { allowed: false, title: 'Nagranie wygasło', message: 'Nagranie wygasło' },
      };
    }

    if (rec.session_date) {
      const { data: settings } = await db
        .from('site_settings')
        .select('value')
        .eq('key', 'recording_retention_days')
        .maybeSingle();

      const globalDays = settings?.value ? parseInt(settings.value, 10) : 365;
      const globalExpiry = new Date(
        new Date(rec.session_date).getTime() + globalDays * 86400000,
      );

      if (globalExpiry < now) {
        return {
          ok: false,
          status: 200,
          body: { allowed: false, title: 'Nagranie wygasło', message: 'Nagranie wygasło' },
        };
      }
    }
  }

  return { ok: true, recording: rec };
}
