import { createHash } from 'crypto';
import type { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * lib/live/meeting-constants.ts
 *
 * Single source of truth for HTG Meeting Recording Pipeline constants and
 * pure helpers. No side effects, no DB writes beyond the typed audit helper.
 *
 * Added in PR #3 of plan v8. Used by:
 *   - app/api/htg-meeting/session/[id]/control/route.ts      (PR #4)
 *   - app/api/live/webhook/route.ts                           (PR #5)
 *   - app/api/cron/process-recordings/route.ts                (PR #6)
 *   - app/api/cron/htg-meeting-orphan-reaper/route.ts         (PR #6)
 *   - app/api/video/htg-meeting-recording-token/route.ts      (PR #7)
 *   - lib/bunny-backup-storage.ts                              (PR #3, path helper)
 *   - lib/live/meeting-recording-lock.ts                       (PR #3, lock key)
 */

type DB = ReturnType<typeof createSupabaseServiceRole>;

// ============================================================
// Room naming
// ============================================================

/**
 * Prefix for all HTG Meeting LiveKit room names.
 * Webhooks filter events by this prefix; `control/start` generates new rooms
 * using this prefix + session UUID. Constant — no env var (previous drift
 * between env value in webhook vs control caused silent event drops).
 */
export const HTG_MEETING_ROOM_PREFIX = 'meeting-' as const;

// ============================================================
// Consent versioning
// ============================================================

/**
 * Canonical site_settings key for current consent version.
 * Read via readSiteSettingString(db, CONSENT_VERSION_KEY). Seeded to
 * 'v1-2026-04' in migration 052. Bump when consent text changes; existing
 * participants will need to re-accept before re-joining a recorded session.
 */
export const CONSENT_VERSION_KEY = 'htg_meeting_current_consent_version' as const;

// ============================================================
// Identity validation
// ============================================================

/**
 * Strict UUID v4-ish regex for validating user_id parsed from LiveKit identity.
 * Identity format is "uuid:sanitized_display_name" — split on first colon,
 * then validate the prefix with this regex. Rejects non-UUID prefixes that
 * could come from admin impersonation, bots, or future format drift.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Audit actions — TS-enforced list
// ============================================================

/**
 * Full list of valid audit actions for htg_meeting_recording_audit.
 *
 * IMPORTANT: The DB table has NO CHECK constraint on the action column —
 * validation lives here. auditHtgRecording() below uses `action: MeetingAuditAction`
 * so TypeScript errors when you try to audit an action not in this list.
 *
 * Adding a new audit event in code REQUIRES adding the string here first.
 * Catches drift at compile time, not runtime.
 */
export const MEETING_AUDIT_ACTIONS = [
  // Recording lifecycle
  'recording_created', 'recording_ignored',
  'egress_started', 'egress_ended', 'egress_stopped',
  'egress_stop_failed', 'egress_force_abandoned',
  'egress_orphan_started', 'egress_orphan_ended',

  // Race protection
  'race_webhook_ahead_of_commit',
  'ghost_egress_junction_failed',
  'late_joiner_egress_started',
  'egress_skipped_not_participant',
  'participant_joined_before_db_commit',

  // Consent + access
  'consent_missing_at_track_start',
  'consent_missing_at_grant',
  'recording_consent_granted',
  'removed_no_consent',

  // Upload pipeline
  'upload_started', 'upload_ready', 'upload_failed',
  'upload_resurrect_after_late_ended',

  // Access grants
  'access_granted', 'access_revoked', 'access_restored', 'access_playback',
  'access_grant_skipped_revoked',

  // Admin actions
  'admin_grant', 'admin_bypass_consent_gate',
  'retry_recording_triggered',

  // AI transcription (PR #10)
  'transcribe_started', 'transcribe_ready', 'transcribe_failed',
] as const;

export type MeetingAuditAction = typeof MEETING_AUDIT_ACTIONS[number];

/**
 * Typed audit helper — writes to htg_meeting_recording_audit with compile-time
 * enforcement on action string. Adding a new event in code without adding it
 * to MEETING_AUDIT_ACTIONS above fails the TypeScript build.
 *
 * NOTE: htg_meeting_recording_audit table is created by migration 053 in PR #2.
 * Callers must run after PR #2 merges — this helper is only used from PR #4
 * onwards (control/start, webhook, cron).
 */
export async function auditHtgRecording(
  db: DB,
  recordingId: string | null,
  egressId: string | null,
  action: MeetingAuditAction,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.from('htg_meeting_recording_audit' as any).insert({
    recording_id: recordingId,
    egress_id: egressId,
    action,
    details,
  });
}

// ============================================================
// Egress duration helper
// ============================================================

/**
 * Compute duration seconds from LiveKit EgressInfo timestamps.
 *
 * LiveKit SDK 2.x returns `startedAt`/`endedAt` as bigint nanoseconds (from
 * protobuf Timestamp). Older versions or future SDK drift may use milliseconds
 * or plain numbers. The heuristic `diff > 1e12` distinguishes the two
 * (1e12 ns = 1000s = 16 min; 1e12 ms = 31.7 years — realistic sessions
 * never land there).
 *
 * Returns null if either timestamp is missing, 0 if they're equal or inverted.
 */
export function computeDurationFromEgress(egress: {
  startedAt?: bigint | number;
  endedAt?: bigint | number;
}): number | null {
  if (!egress.startedAt || !egress.endedAt) return null;

  const started =
    typeof egress.startedAt === 'bigint' ? Number(egress.startedAt) : egress.startedAt;
  const ended =
    typeof egress.endedAt === 'bigint' ? Number(egress.endedAt) : egress.endedAt;

  const diff = ended - started;
  if (diff <= 0) return 0;

  // Heuristic: large diff = nanoseconds, small diff = milliseconds
  return Math.floor(diff > 1e12 ? diff / 1_000_000_000 : diff / 1000);
}

// ============================================================
// User ID → path hash (privacy)
// ============================================================

/**
 * Deterministic user_id → path hash for Bunny Storage paths.
 *
 * Uses Node `crypto.createHash` (NOT browser `crypto.subtle` — cron runs in
 * Node runtime). Salt comes from MEETING_PATH_SALT env var and must be set
 * in all environments (dev/staging/prod). Admin without salt knowledge
 * cannot correlate `{user_hash16}-{rec_short_id}.mp4` back to actual user_ids.
 *
 * Returns first 16 hex chars of SHA-256(user_id + salt) — ~18 bits of collision
 * resistance, sufficient for per-session path disambiguation while keeping
 * paths short enough for human browsing.
 *
 * THROWS if MEETING_PATH_SALT is not set. Previous dev-only bypass caused
 * drifted paths between dev and staging; salt must be explicit in .env.local.
 */
export function hashUserIdForPath(userId: string): string {
  const salt = process.env.MEETING_PATH_SALT;
  if (!salt) {
    throw new Error(
      'MEETING_PATH_SALT env var is required for privacy-safe storage paths. ' +
      'Set it in .env.local for dev and in Vercel env for staging/prod. ' +
      'See .env.local.example.',
    );
  }
  return createHash('sha256').update(userId + salt).digest('hex').slice(0, 16);
}
