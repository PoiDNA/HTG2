/* Migration 055: DROP legacy htg_meeting_recordings (v1) table.
   ============================================================================
   Context
   -------
   The original `htg_meeting_recordings` table (migration 018) was broken from
   day one — nothing ever wrote to it in production because the webhook and
   cron pipelines required `htg_meeting_egresses` junction, which didn't exist.
   The new pipeline (migration 053) introduced `htg_meeting_recordings_v2` as
   the authoritative table.

   This migration removes the v1 shell. Plan v9 rolled the DROP together with
   the `recording-check` endpoint update in the SAME PR (PR #7) to eliminate
   a deploy gap where the endpoint queried a dropped table.

   Data sanity check
   -----------------
   The DO block verifies the table is empty before DROP. If production
   somehow wrote rows after PR #1 (migration 052) shipped, we refuse to
   destroy them silently — admin must review first.

   Rollout safety
   --------------
   Every code path that referenced `htg_meeting_recordings` is migrated to
   `htg_meeting_recordings_v2` in the SAME PR #7 commit (this migration is
   the first commit, endpoint updates second). Supabase migration ordering
   ensures this runs before the endpoint swap. */

/* ── Part 1: data sanity check ─────────────────────────────────────────── */
DO $$
DECLARE
  row_count INT;
  exists_flag BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'htg_meeting_recordings'
  ) INTO exists_flag;

  IF NOT exists_flag THEN
    RAISE NOTICE 'htg_meeting_recordings table not found — migration is a no-op';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.htg_meeting_recordings' INTO row_count;

  IF row_count > 0 THEN
    RAISE EXCEPTION 'Migration 055 aborted: htg_meeting_recordings has % rows — manual review required before DROP. Move data to htg_meeting_recordings_v2 or set legal hold, then comment out this assertion and re-run.', row_count;
  END IF;
END $$;

/* ── Part 2: DROP legacy table (v1) ─────────────────────────────────────── */
DROP TABLE IF EXISTS public.htg_meeting_recordings;
