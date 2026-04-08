-- Migration 046: Recording phase + backup + lease lock + retry cooldown
-- ============================================================================
-- Adds support for recording all 3 session phases (wstep/sesja/podsumowanie),
-- backup recording to a separate Bunny library (warm DR + hot failover),
-- lease-based locking to prevent race conditions on egress start, and
-- cooldown tracking for staff retry actions.

-- ── booking_recordings: phase column ────────────────────────────────────────
-- Distinguishes which session phase a recording belongs to.
-- Default 'sesja' makes this backward-compatible: existing rows are all sesja.
ALTER TABLE public.booking_recordings
  ADD COLUMN IF NOT EXISTS recording_phase TEXT DEFAULT 'sesja'
  CHECK (recording_phase IN ('wstep', 'sesja', 'podsumowanie'));

CREATE INDEX IF NOT EXISTS idx_booking_recordings_phase
  ON public.booking_recordings(recording_phase);

-- ── booking_recordings: backup columns ──────────────────────────────────────
-- Backup state is tracked independently from primary.
-- NULL backup_status = no backup attempted (graceful degradation when env not set).
ALTER TABLE public.booking_recordings
  ADD COLUMN IF NOT EXISTS backup_bunny_video_id TEXT,
  ADD COLUMN IF NOT EXISTS backup_bunny_library_id TEXT,
  ADD COLUMN IF NOT EXISTS backup_status TEXT DEFAULT NULL
    CHECK (backup_status IS NULL OR backup_status IN
      ('queued','preparing','uploading','processing','ready','failed'));

-- ── live_sessions: lease lock + retry cooldown ──────────────────────────────
-- recording_lock_until: lease-based lock for egress start (prevents race
--   between phase transition and consent endpoint). NULL = unlocked.
--   Lock auto-expires after timestamp passes — no risk of stuck locks
--   from crashed Vercel functions.
-- last_retry_at: cooldown for staff "retry recording" action (60s anti-spam,
--   stored in DB because Vercel runs multiple instances).
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS recording_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- ── booking_recording_audit: extend allowed actions ─────────────────────────
-- Add new audit actions for backup lifecycle and retry tracking.
-- Drop the old constraint and recreate with the expanded set.
ALTER TABLE public.booking_recording_audit
  DROP CONSTRAINT IF EXISTS booking_recording_audit_action_check;

ALTER TABLE public.booking_recording_audit
  ADD CONSTRAINT booking_recording_audit_action_check
  CHECK (action IN (
    'recording_created', 'recording_ignored',
    'bunny_video_created', 'bunny_fetch_started',
    'bunny_encoding', 'bunny_ready', 'bunny_failed', 'bunny_deleted',
    'source_cleaned', 'expired', 'retry', 'preparing_stuck_reset',
    'consent_capture_granted', 'consent_access_granted',
    'access_granted', 'access_revoked',
    'pair_revoke_emergency', 'admin_dispute_resolved',
    'notification_sent',
    'admin_decision', 'legal_hold_set', 'legal_hold_released',
    'import_matched', 'import_manual_review', 'import_admin_assigned',
    'orphan_deleted',
    'consent_missing_at_grant',
    -- New: backup lifecycle
    'backup_started', 'backup_ready', 'backup_failed', 'backup_deleted',
    -- New: retry tracking
    'retry_recording_triggered'
  ));
