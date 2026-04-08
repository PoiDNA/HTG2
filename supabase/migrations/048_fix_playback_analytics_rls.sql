-- ============================================================
-- 048: Fix overly-broad RLS policies in playback_analytics tables
-- ============================================================
--
-- BACKGROUND
-- Migration 014_playback_analytics.sql created two RLS policies named
-- "pp_service" and "rpe_service" on playback_positions and
-- recording_play_events. The names suggest "service role only", but the
-- actual definitions have no TO clause:
--
--   CREATE POLICY "pp_service"  ON public.playback_positions
--     USING (true) WITH CHECK (true);
--   CREATE POLICY "rpe_service" ON public.recording_play_events
--     USING (true) WITH CHECK (true);
--
-- In PostgreSQL, a policy without a TO clause defaults to PUBLIC, meaning
-- it applies to ALL roles — including anon and authenticated. Combined with
-- `USING (true) WITH CHECK (true)`, this grants full read/write access to
-- anyone with a JWT (or even anon key) who hits PostgREST directly.
--
-- The comment in 014 line 34 says "users can only insert/view their own"
-- but nothing in the policy enforces that. It's a latent data exposure.
--
-- IMPACT CHECK
-- All current consumers use service_role (which bypasses RLS entirely):
--   - app/api/video/play-position/route.ts     → createSupabaseServiceRole()
--   - app/api/analytics/recording-play/route.ts → createSupabaseServiceRole()
--   - app/api/analytics/stats/route.ts          → createSupabaseServiceRole()
--
-- No frontend code reads these tables via PostgREST with anon/authenticated
-- JWT, so dropping the policies has no behavioral impact on our application.
-- Defense in depth: future code that accidentally uses the anon key will be
-- denied at the database layer instead of silently leaking data.
--
-- TARGET STATE
-- Both tables: RLS enabled, ZERO policies for any role. service_role
-- bypasses RLS so our API still works; anon/authenticated/public get
-- "no policy = deny all".
--
-- RELATED: 036_recording_security_fixes.sql established the same pattern
-- for booking_recording_access (drop broad policies, rely on service_role).
-- This migration applies that lesson to the playback analytics tables.

-- Drop the overly-broad policies. IF EXISTS so the migration is idempotent
-- and safe to re-run (e.g. after a supabase db reset).
DROP POLICY IF EXISTS "pp_service"  ON public.playback_positions;
DROP POLICY IF EXISTS "rpe_service" ON public.recording_play_events;

-- Confirm the target state: no non-service_role policies should remain on
-- either table. If somebody added ad-hoc policies via the Supabase dashboard
-- between migration 014 and this one, the check below will fail and tell us.
-- service_role-only policies are allowed because they're harmless (service_role
-- already bypasses RLS), but we don't expect any.
DO $$
DECLARE
  pp_count int;
  rpe_count int;
BEGIN
  SELECT count(*) INTO pp_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'playback_positions'
    AND NOT (roles = ARRAY['service_role']::name[]);

  SELECT count(*) INTO rpe_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'recording_play_events'
    AND NOT (roles = ARRAY['service_role']::name[]);

  IF pp_count > 0 THEN
    RAISE EXCEPTION
      'Lockdown failed: % non-service_role policies remain on playback_positions',
      pp_count;
  END IF;

  IF rpe_count > 0 THEN
    RAISE EXCEPTION
      'Lockdown failed: % non-service_role policies remain on recording_play_events',
      rpe_count;
  END IF;
END $$;

-- RLS must stay enabled — dropping policies without RLS enabled would
-- allow unrestricted access. Migration 014 already enables both tables
-- but ENABLE is idempotent, so assert the state defensively.
ALTER TABLE public.playback_positions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_play_events ENABLE ROW LEVEL SECURITY;
