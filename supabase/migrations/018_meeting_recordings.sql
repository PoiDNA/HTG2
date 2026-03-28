-- 018: HTG Meeting Recordings + Speaking Events (dla timeline)
-- IDEMPOTENT — safe to run multiple times

CREATE TABLE IF NOT EXISTS public.htg_meeting_recordings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID        NOT NULL REFERENCES public.htg_meeting_sessions(id) ON DELETE CASCADE,
  bunny_video_id   TEXT,
  bunny_library_id TEXT,
  duration_seconds INT,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id)
);

CREATE TABLE IF NOT EXISTS public.htg_speaking_events (
  id                       UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               UUID   NOT NULL REFERENCES public.htg_meeting_sessions(id) ON DELETE CASCADE,
  user_id                  UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name             TEXT   NOT NULL,
  started_offset_seconds   FLOAT  NOT NULL,
  ended_offset_seconds     FLOAT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_htg_speaking_events_session ON public.htg_speaking_events(session_id);

ALTER TABLE public.htg_meeting_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.htg_speaking_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_read_recording"       ON public.htg_meeting_recordings;
DROP POLICY IF EXISTS "participants_read_speaking_events" ON public.htg_speaking_events;
DROP POLICY IF EXISTS "service_write_recording"           ON public.htg_meeting_recordings;
DROP POLICY IF EXISTS "service_write_speaking_events"     ON public.htg_speaking_events;

CREATE POLICY "participants_read_recording" ON public.htg_meeting_recordings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.htg_meeting_participants p
    WHERE p.session_id = htg_meeting_recordings.session_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "participants_read_speaking_events" ON public.htg_speaking_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.htg_meeting_participants p
    WHERE p.session_id = htg_speaking_events.session_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "service_write_recording"       ON public.htg_meeting_recordings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_write_speaking_events" ON public.htg_speaking_events     FOR ALL USING (true) WITH CHECK (true);
