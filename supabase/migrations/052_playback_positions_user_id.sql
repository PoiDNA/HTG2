-- ============================================================
-- 052: Add user_id to playback_positions for row-level isolation
-- ============================================================
--
-- BACKGROUND
-- Migration 014 created playback_positions keyed only by session_id + play_event_id.
-- The resume-position read in app/api/video/play-position/route.ts GET filtered
-- only by session_id, which meant any user viewing the same recording would
-- read the last position written by ANY user.
--
-- After PR #XXX (this PR) extends booking-recording preview to admin and staff
-- (Natalia, Agata, Justyna, Przemek) via /admin/sesje + /prowadzacy/sesje,
-- this cross-user leak became exploitable: admin preview would resume from
-- the client's last listening position, and the analytics graph could mix
-- per-user sessions.
--
-- FIX
-- Add nullable user_id, backfill from play_events.user_id (linked row is
-- NOT NULL in the source), index (user_id, session_id, created_at DESC),
-- and update the endpoint to filter by user_id on GET + write user_id on POST.
--
-- DEPLOY ORDER
-- Migration must be applied BEFORE the new endpoint code deploys.
-- Otherwise the new code fails with `column "user_id" does not exist`.
--
-- Rows with a NULL play_event_id (if any) will retain user_id = NULL after
-- backfill — those very old rows fall out of the new filter and the user
-- restarts from position 0. Acceptable.

ALTER TABLE public.playback_positions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill: derive user_id from linked play_events row
UPDATE public.playback_positions pp
SET user_id = pe.user_id
FROM public.play_events pe
WHERE pp.play_event_id = pe.id
  AND pp.user_id IS NULL;

-- Composite index for efficient per-user resume queries
CREATE INDEX IF NOT EXISTS idx_pp_user_session
  ON public.playback_positions(user_id, session_id, created_at DESC);
