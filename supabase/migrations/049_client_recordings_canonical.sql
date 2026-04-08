-- ============================================================
-- 049: client_recordings canonical schema + lifecycle + RLS lockdown
-- ============================================================
--
-- BACKGROUND
-- Consolidates three planned phases of the client_recordings triage:
--   - Faza 4.A: capture canonical schema in repo (was drifted on prod)
--   - Faza 4.B: drop overly-broad RLS policies, target service_role only
--   - Faza 5:   add lifecycle columns (expires_at, deleted_at) for RODO
--               art. 17 right-to-erasure and retention policy
--
-- RATIONALE FOR CONSOLIDATION
-- Normally each phase would be its own PR, but production verification showed:
--   - client_recordings has 0 rows (feature unused on prod)
--   - recording_play_events also has 0 rows (0 non-null recording_id)
--   - DROP TABLE CASCADE is therefore safe (no data loss, no orphan rows)
-- With zero data, there's no behavioral difference between a "strict 1:1 capture"
-- and a "clean rewrite" — so we skip the intermediate state and jump to the
-- canonical target.
--
-- WHAT THIS MIGRATION DOES
-- 1. DROP the ad-hoc table (and CASCADE the FK from recording_play_events).
-- 2. CREATE the canonical table with all production columns + 3 new lifecycle
--    columns (expires_at, deleted_at, deleted_by).
-- 3. Recreate the FK on recording_play_events.recording_id with ON DELETE CASCADE
--    (matches migration 014's original definition).
-- 4. Recreate indexes from production + 2 new indexes for retention/soft-delete
--    queries.
-- 5. Enable RLS with ZERO policies — all access must go through service_role
--    (matches the pattern established in migrations 036 and 048).
--
-- WHAT IT DOES NOT DO
-- - Does not backfill storage_url from full URL to path-only (no rows to backfill).
-- - Does not touch booking_recordings, recording_play_events (beyond FK), or
--   any other table.
-- - Does not create the token signing endpoint or change any application code —
--   those changes are in sibling commits of the same PR.

-- ============================================================
-- STEP 1: Drop the out-of-band table (0 rows confirmed on prod)
-- ============================================================
--
-- CASCADE drops the FK constraint recording_play_events.recording_id → client_recordings(id).
-- Rows in recording_play_events are NOT affected by DROP TABLE (only FK is dropped).
-- Verified pre-migration that recording_play_events has 0 rows with non-null recording_id,
-- so there are no orphan references to worry about.
DROP TABLE IF EXISTS public.client_recordings CASCADE;

-- ============================================================
-- STEP 2: Create canonical client_recordings table
-- ============================================================
CREATE TABLE public.client_recordings (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership (ON DELETE CASCADE matches production; required for RODO art. 17)
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id        UUID          NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,

  -- Source live session (ON DELETE SET NULL: we want recording metadata to survive
  -- if the live_sessions row is purged for any reason — historical value).
  -- Production had NO ACTION which would block live_sessions cleanup; fixing here.
  live_session_id   UUID          REFERENCES public.live_sessions(id) ON DELETE SET NULL,

  -- Recording metadata
  type              TEXT          NOT NULL CHECK (type IN ('before', 'after')),
  format            TEXT          NOT NULL CHECK (format IN ('video', 'audio')),

  -- Storage path within Bunny Storage zone htg2 (e.g. "client-recordings/<uid>/<bid>/<file>.webm").
  -- IMPORTANT: stores PATH only, not full URL. Playback URLs are signed on-demand
  -- via signPrivateCdnUrl() server-side (htg-private.b-cdn.net pull zone with token auth).
  -- Previous production schema stored the full public CDN URL which was the main P0 RODO gap.
  storage_url       TEXT          NOT NULL,

  duration_seconds  INTEGER,
  file_size_bytes   BIGINT,

  -- Sharing mode (placebo UI was removed in PR #1; canonical values reserved for Faza 7)
  sharing_mode      TEXT          NOT NULL DEFAULT 'private'
                                  CHECK (sharing_mode IN ('private', 'favorites', 'invited', 'public')),

  -- User metadata (optional) — present in production schema, preserved
  invited_emails    TEXT[]        DEFAULT '{}',
  title             TEXT,
  notes             TEXT,

  -- NEW: Retention (set at insert time from bookings.slot_date + 365 days or created_at + 365)
  expires_at        TIMESTAMPTZ,

  -- NEW: Soft delete (RODO art. 17 right-to-erasure)
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps (both present in production)
  created_at        TIMESTAMPTZ   DEFAULT now(),
  updated_at        TIMESTAMPTZ   DEFAULT now()
);

-- ============================================================
-- STEP 3: Re-establish FK from recording_play_events
-- ============================================================
-- The FK was dropped by CASCADE in step 1. Recreate it with the same definition
-- as migration 014 (ON DELETE CASCADE — so deleting a recording cascades to its
-- play events). No rows in recording_play_events point to client_recordings
-- (verified: 0 non-null recording_id values), so re-adding the FK is safe.
ALTER TABLE public.recording_play_events
  ADD CONSTRAINT recording_play_events_recording_id_fkey
  FOREIGN KEY (recording_id) REFERENCES public.client_recordings(id) ON DELETE CASCADE;

-- ============================================================
-- STEP 4: Indexes
-- ============================================================
-- Production indexes, recreated:
CREATE INDEX idx_client_rec_user    ON public.client_recordings(user_id);
CREATE INDEX idx_client_rec_booking ON public.client_recordings(booking_id);

-- Partial index on sharing_mode (production had this; kept for future sharing queries).
-- Excludes 'private' because that's the default and covers ~all rows.
CREATE INDEX idx_client_rec_sharing
  ON public.client_recordings(sharing_mode)
  WHERE sharing_mode <> 'private';

-- NEW: Retention sweeps — find rows that need to expire.
-- Partial index excludes already-deleted rows (most rows over time).
CREATE INDEX idx_client_rec_expires
  ON public.client_recordings(expires_at)
  WHERE deleted_at IS NULL;

-- NEW: Soft-delete purge sweeps — find rows that need hard delete after grace period.
-- Partial index only includes deleted rows (fast for the cron job).
CREATE INDEX idx_client_rec_deleted
  ON public.client_recordings(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ============================================================
-- STEP 5: RLS — enable, no policies for non-service_role
-- ============================================================
-- Production had three policies all scoped to {public} role:
--   - client_rec_own    (ALL, user_id = auth.uid())
--   - client_rec_public (SELECT, sharing_mode = 'public')
--   - client_rec_staff  (SELECT, via profiles.role or staff_members)
--
-- All three were effectively dead code on prod because application code uses
-- createSupabaseServiceRole() which bypasses RLS anyway. But they were
-- dangerous: if anyone ever started reading via PostgREST with anon/authenticated
-- JWT, the table was wide open (especially client_rec_public which granted SELECT
-- to anyone for any row marked 'public' — a footgun waiting to happen once the
-- sharing feature ships in Faza 7).
--
-- Target state: RLS enabled, ZERO policies. Matches migration 036 (booking_recordings)
-- and 048 (playback_positions/recording_play_events). All reads/writes go through
-- server-side API with service_role.

ALTER TABLE public.client_recordings ENABLE ROW LEVEL SECURITY;

-- No CREATE POLICY statements. Intentional.
-- service_role bypasses RLS automatically — app continues to work.
-- anon / authenticated / public get "no policy = deny all".

-- ============================================================
-- STEP 6: Verify end state
-- ============================================================
-- Assert: zero policies for non-service_role on client_recordings.
-- If anyone added ad-hoc policies between this migration being written and applied,
-- this check fails loudly. Good fail-fast.
DO $$
DECLARE
  policy_count int;
BEGIN
  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'client_recordings'
    AND NOT (roles = ARRAY['service_role']::name[]);

  IF policy_count > 0 THEN
    RAISE EXCEPTION
      'client_recordings should have 0 non-service_role policies after migration, found %',
      policy_count;
  END IF;
END $$;
