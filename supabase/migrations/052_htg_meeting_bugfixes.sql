/* Migration 052: HTG Meetings bug fixes + RLS tighten + consent columns
   ============================================================================
   PR #1 of HTG Meeting Recording Pipeline (see plan v8).

   Contents:
   - Part 1: htg_speaking_events — add is_closed flag (fixes schema mismatch
             with speaking-event endpoint that never worked before)
   - Part 2: htg_meetings — add visibility column for public/private catalog
   - Part 3: htg_meeting_participants — add recording consent columns
   - Part 4: htg_meeting_sessions — add composite_recording_started, lock,
             retry tracking columns
   - Part 5: site_settings — seed consent version
   - Part 6: backfill consent version for existing participants
   - Part 7: performance indexes
   - Part 8: RLS tightening — remove all service_* / FOR ALL (true) policies
             on htg_* tables, replace with proper per-user / per-admin policies
   - Part 9: RLS assertion — warn (not error) if overly-permissive policies
             remain on htg_* tables

   Does NOT create new recording pipeline tables — that's migration 053 (PR #2).
   Does NOT drop old htg_meeting_recordings — that's migration 054 (PR #7). */


/* ── Part 1: speaking events ───────────────────────────────────────────── */
/* Add is_closed flag to replace float-equality "open event" heuristic. */
ALTER TABLE public.htg_speaking_events
  ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false;

/* Existing rows (if any) are all treated as closed — they have final offset values. */
UPDATE public.htg_speaking_events SET is_closed = true WHERE is_closed = false;

CREATE INDEX IF NOT EXISTS idx_hse_open
  ON public.htg_speaking_events(session_id, user_id)
  WHERE is_closed = false;


/* ── Part 2: meeting visibility ────────────────────────────────────────── */
ALTER TABLE public.htg_meetings
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private'));


/* ── Part 3: recording consent columns on participants ─────────────────── */
ALTER TABLE public.htg_meeting_participants
  ADD COLUMN IF NOT EXISTS recording_consent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_consent_version TEXT;


/* ── Part 4: lock, retry, composite flag on sessions ───────────────────── */
ALTER TABLE public.htg_meeting_sessions
  ADD COLUMN IF NOT EXISTS composite_recording_started BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_lock_until        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_retry_at               TIMESTAMPTZ;


/* ── Part 5: consent version in site_settings ──────────────────────────── */
/* Canonical key used across code: lib/live/meeting-constants.ts CONSENT_VERSION_KEY */
INSERT INTO public.site_settings (key, value)
VALUES ('htg_meeting_current_consent_version', '"v1-2026-04"'::jsonb)
ON CONFLICT (key) DO NOTHING;


/* ── Part 6: backfill consent version for existing rows ────────────────── */
/* Any participant who already had recording_consent_at before this migration
   is considered to have accepted v1-2026-04. New rows must explicitly set the
   version in application code. Column stays nullable — participants without
   consent must NOT have a version. */
UPDATE public.htg_meeting_participants
  SET recording_consent_version = 'v1-2026-04'
  WHERE recording_consent_at IS NOT NULL
    AND recording_consent_version IS NULL;


/* ── Part 7: performance indexes for RLS nested EXISTS queries ─────────── */
CREATE INDEX IF NOT EXISTS idx_hm_visibility
  ON public.htg_meetings(visibility) WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_hmp_user_session_status
  ON public.htg_meeting_participants(user_id, session_id, status);

CREATE INDEX IF NOT EXISTS idx_hmsess_meeting_mod
  ON public.htg_meeting_sessions(meeting_id, moderator_id);


/* ── Part 8: RLS tightening — drop service_* / FOR ALL (true), add proper ─ */

/* htg_meetings — drop FOR ALL policies from migration 016 */
DROP POLICY IF EXISTS "service_all_meetings" ON public.htg_meetings;

CREATE POLICY hm_public_read ON public.htg_meetings FOR SELECT USING (
  visibility = 'public' AND auth.uid() IS NOT NULL
);
CREATE POLICY hm_participant_read ON public.htg_meetings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.htg_meeting_sessions s
    JOIN public.htg_meeting_participants p ON p.session_id = s.id
    WHERE s.meeting_id = htg_meetings.id AND p.user_id = auth.uid()
  )
);
CREATE POLICY hm_admin_all ON public.htg_meetings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* htg_meeting_stages — read follows meeting visibility */
DROP POLICY IF EXISTS "service_all_stages" ON public.htg_meeting_stages;

CREATE POLICY hms_read ON public.htg_meeting_stages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.htg_meetings m
    WHERE m.id = htg_meeting_stages.meeting_id
      AND (
        m.visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM public.htg_meeting_sessions s
          JOIN public.htg_meeting_participants p ON p.session_id = s.id
          WHERE s.meeting_id = m.id AND p.user_id = auth.uid()
        )
      )
  )
);
CREATE POLICY hms_admin_all ON public.htg_meeting_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* htg_meeting_questions — read follows stage */
DROP POLICY IF EXISTS "service_all_questions" ON public.htg_meeting_questions;

CREATE POLICY hmq_read ON public.htg_meeting_questions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.htg_meeting_stages st
    JOIN public.htg_meetings m ON m.id = st.meeting_id
    WHERE st.id = htg_meeting_questions.stage_id
      AND (
        m.visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM public.htg_meeting_sessions s
          JOIN public.htg_meeting_participants p ON p.session_id = s.id
          WHERE s.meeting_id = m.id AND p.user_id = auth.uid()
        )
      )
  )
);
CREATE POLICY hmq_admin_all ON public.htg_meeting_questions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* htg_meeting_sessions — participant sees their sessions, moderator sees own, admin all */
DROP POLICY IF EXISTS "service_all_sessions" ON public.htg_meeting_sessions;

CREATE POLICY hmsess_moderator_read ON public.htg_meeting_sessions FOR SELECT USING (
  moderator_id = auth.uid()
);
CREATE POLICY hmsess_participant_read ON public.htg_meeting_sessions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.htg_meeting_participants p
    WHERE p.session_id = htg_meeting_sessions.id AND p.user_id = auth.uid()
  )
);
CREATE POLICY hmsess_admin_all ON public.htg_meeting_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* htg_meeting_participants — users see own row + moderators see their sessions */
DROP POLICY IF EXISTS "service_all_participants" ON public.htg_meeting_participants;

CREATE POLICY hmp_self_read ON public.htg_meeting_participants FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY hmp_moderator_read ON public.htg_meeting_participants FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.htg_meeting_sessions s
    WHERE s.id = htg_meeting_participants.session_id AND s.moderator_id = auth.uid()
  )
);
CREATE POLICY hmp_admin_all ON public.htg_meeting_participants FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* htg_meeting_queue — same pattern */
DROP POLICY IF EXISTS "service_all_queue" ON public.htg_meeting_queue;

CREATE POLICY hmq_queue_self_read ON public.htg_meeting_queue FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY hmq_queue_moderator_read ON public.htg_meeting_queue FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.htg_meeting_sessions s
    WHERE s.id = htg_meeting_queue.session_id AND s.moderator_id = auth.uid()
  )
);
CREATE POLICY hmq_queue_admin_all ON public.htg_meeting_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* htg_speaking_events — drop broad service_write, keep participants_read */
DROP POLICY IF EXISTS "service_write_speaking_events" ON public.htg_speaking_events;

CREATE POLICY hse_admin ON public.htg_speaking_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
/* Note: "participants_read_speaking_events" policy from migration 018 remains in place. */


/* htg_meeting_recordings (v1, will be dropped in migration 054) —
   tighten write access in case it gets data before being dropped. */
DROP POLICY IF EXISTS "service_write_recording" ON public.htg_meeting_recordings;

CREATE POLICY hmr_v1_admin ON public.htg_meeting_recordings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
/* Note: "participants_read_recording" policy from migration 018 remains in place. */


/* htg_participant_profiles — admin only + self read (scoring is sensitive) */
DROP POLICY IF EXISTS "service_all_profiles" ON public.htg_participant_profiles;

CREATE POLICY hpp_self_read ON public.htg_participant_profiles FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY hpp_admin_all ON public.htg_participant_profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* htg_group_proposals — admin only */
DROP POLICY IF EXISTS "service_all_proposals" ON public.htg_group_proposals;

CREATE POLICY hgp_admin_all ON public.htg_group_proposals FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* ── Part 9: RLS assertion — heuristic check for overly-permissive policies ─ */
/* This is a HEURISTIC (string match on qual='true'), not a hard guarantee.
   PR #1 checklist requires manual review of pg_policies on htg_* tables.
   Uses RAISE WARNING so migration doesn't fail on format variations. */
DO $$
DECLARE
  permissive_count INT;
BEGIN
  SELECT count(*) INTO permissive_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename LIKE 'htg_%'
    AND (qual = 'true' OR with_check = 'true');
  IF permissive_count > 0 THEN
    RAISE WARNING 'Migration 052 note: % htg_* policies look overly permissive (USING true or WITH CHECK true) — manual review required', permissive_count;
  END IF;
END $$;
