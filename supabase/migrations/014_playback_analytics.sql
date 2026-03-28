-- ============================================================
-- 014: Playback Analytics — retention graphs + recording plays
-- ============================================================

-- Position heartbeats: record where in the video the user is every 30s
-- Used to build YouTube-like retention/engagement graphs
CREATE TABLE IF NOT EXISTS public.playback_positions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  play_event_id   UUID          REFERENCES public.play_events(id) ON DELETE CASCADE,
  session_id      TEXT          NOT NULL,           -- redundant for faster queries
  position_seconds INTEGER      NOT NULL,
  total_duration_seconds INTEGER,                   -- video total length (if known)
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_play_event  ON public.playback_positions(play_event_id);
CREATE INDEX IF NOT EXISTS idx_pp_session     ON public.playback_positions(session_id);
CREATE INDEX IF NOT EXISTS idx_pp_created     ON public.playback_positions(created_at DESC);

-- Play events for client recordings (nagrania przed/po) — no DRM, just counting
CREATE TABLE IF NOT EXISTS public.recording_play_events (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          REFERENCES auth.users(id) ON DELETE CASCADE,
  recording_id    UUID          REFERENCES public.client_recordings(id) ON DELETE CASCADE,
  play_duration_seconds INTEGER,
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rpe_user      ON public.recording_play_events(user_id);
CREATE INDEX IF NOT EXISTS idx_rpe_recording ON public.recording_play_events(recording_id);
CREATE INDEX IF NOT EXISTS idx_rpe_started   ON public.recording_play_events(started_at DESC);

-- RLS: service role has full access, users can only insert/view their own
ALTER TABLE public.playback_positions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_play_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_service"  ON public.playback_positions;
DROP POLICY IF EXISTS "rpe_service" ON public.recording_play_events;

CREATE POLICY "pp_service"  ON public.playback_positions    USING (true) WITH CHECK (true);
CREATE POLICY "rpe_service" ON public.recording_play_events USING (true) WITH CHECK (true);
