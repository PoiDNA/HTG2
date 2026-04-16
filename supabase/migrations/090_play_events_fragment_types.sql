-- Migration 090: Extend play_events.session_type CHECK for fragment contexts
-- ===========================================================================
-- Adds three new session_type values used by AudioEngine when playing fragments:
--   fragment_review          — single-fragment playback (VOD source)
--   fragment_radio           — radio shuffle playback (VOD source)
--   fragment_recording_review — single-fragment playback (booking_recording source)
--
-- Fragment events are excluded from abuse-detection heuristics in
-- app/api/video/play-event/route.ts (filter in detectViolations queries).
-- They are retained for audit purposes only.

ALTER TABLE public.play_events
  DROP CONSTRAINT IF EXISTS play_events_session_type_check;

ALTER TABLE public.play_events
  ADD CONSTRAINT play_events_session_type_check CHECK (
    session_type IN (
      'vod',
      'recording',
      'live',
      'fragment_review',
      'fragment_radio',
      'fragment_recording_review'
    )
  );

COMMENT ON COLUMN public.play_events.session_type IS
  'Playback context. fragment_* values excluded from abuse heuristics (high_frequency, mass_play, ip_diversity, concurrent_countries) in play-event/route.ts.';
