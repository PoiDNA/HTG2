-- Migration 089: active_streams — stream_context tag
-- ====================================================
-- Adds a stream_context column to active_streams that tags each row with the
-- kind of playback. Used for analytics and to support future fragment-aware
-- active_streams registration (fragment_review, fragment_radio,
-- fragment_recording_review).
--
-- Concurrent-stream LIMIT stays GLOBAL (no per-context filtering in limiter
-- queries). stream_context is analytics-only — limits in video/token and
-- booking-recording-token continue to read ALL active_streams for the user,
-- regardless of context.
--
-- Deployed in 3 steps to avoid deploy race conditions:
--   Step 1 — ADD COLUMN nullable with DEFAULT 'vod' (old code can still upsert)
--   Step 2 — Backfill existing rows; delete orphaned rows (both references NULL)
--   Step 3 — SET NOT NULL + drop old CHECK + add new CHECK
--
-- Call-site patches (same PR):
--   video/token               upsert adds stream_context='vod'
--   booking-recording-token   upsert adds stream_context='recording'

-- ── Step 1: Add column (nullable + DEFAULT so old code doesn't break) ─────
ALTER TABLE public.active_streams
  ADD COLUMN IF NOT EXISTS stream_context TEXT DEFAULT 'vod';

-- ── Step 2: Backfill ──────────────────────────────────────────────────────

-- VOD rows: session_id set, no booking_recording_id
UPDATE public.active_streams
  SET stream_context = 'vod'
  WHERE session_id IS NOT NULL
    AND booking_recording_id IS NULL;

-- Recording rows: booking_recording_id set, no session_id
UPDATE public.active_streams
  SET stream_context = 'recording'
  WHERE session_id IS NULL
    AND booking_recording_id IS NOT NULL;

-- Orphaned rows (both NULL — stale cleanup): delete them
DELETE FROM public.active_streams
  WHERE session_id IS NULL
    AND booking_recording_id IS NULL;

-- ── Step 3: Constraints ────────────────────────────────────────────────────

-- Make stream_context NOT NULL (all rows now have a value)
ALTER TABLE public.active_streams
  ALTER COLUMN stream_context SET NOT NULL;

-- Remove DEFAULT (stream_context must be explicit in all upsertes after this)
ALTER TABLE public.active_streams
  ALTER COLUMN stream_context DROP DEFAULT;

-- Drop old binary constraint (replaced by the 5-branch version below)
ALTER TABLE public.active_streams
  DROP CONSTRAINT IF EXISTS exactly_one_stream_reference;

-- New 5-branch constraint: session_id / booking_recording_id XOR per context
ALTER TABLE public.active_streams
  ADD CONSTRAINT exactly_one_stream_reference_v2 CHECK (
    (stream_context = 'vod'
      AND session_id IS NOT NULL
      AND booking_recording_id IS NULL)
    OR
    (stream_context = 'recording'
      AND session_id IS NULL
      AND booking_recording_id IS NOT NULL)
    OR
    (stream_context = 'fragment_review'
      AND session_id IS NOT NULL
      AND booking_recording_id IS NULL)
    OR
    (stream_context = 'fragment_radio'
      AND session_id IS NOT NULL
      AND booking_recording_id IS NULL)
    OR
    (stream_context = 'fragment_recording_review'
      AND session_id IS NULL
      AND booking_recording_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_active_streams_context
  ON public.active_streams(user_id, stream_context, last_heartbeat);

COMMENT ON COLUMN public.active_streams.stream_context IS
  'Playback kind tag. Analytics only — concurrent-stream limiter queries ALL rows for user regardless of context (global slot). Upserting code must always supply this value.';
