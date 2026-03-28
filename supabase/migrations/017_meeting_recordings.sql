-- Recording file for a meeting session
CREATE TABLE IF NOT EXISTS public.htg_meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.htg_meeting_sessions(id) ON DELETE CASCADE,
  bunny_video_id TEXT,
  bunny_library_id TEXT,
  duration_seconds INT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id)
);

-- Speaking events logged during meeting (for timeline)
CREATE TABLE IF NOT EXISTS public.htg_speaking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.htg_meeting_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  started_offset_seconds FLOAT NOT NULL,
  ended_offset_seconds FLOAT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_htg_speaking_events_session ON public.htg_speaking_events(session_id);

-- RLS
ALTER TABLE public.htg_meeting_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.htg_speaking_events ENABLE ROW LEVEL SECURITY;

-- Participants can read recordings for their sessions
CREATE POLICY "participants_read_recording" ON public.htg_meeting_recordings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.htg_meeting_participants p
      WHERE p.session_id = htg_meeting_recordings.session_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "participants_read_speaking_events" ON public.htg_speaking_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.htg_meeting_participants p
      WHERE p.session_id = htg_speaking_events.session_id
        AND p.user_id = auth.uid()
    )
  );

-- Staff/admin can write
CREATE POLICY "service_write_recording" ON public.htg_meeting_recordings
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_write_speaking_events" ON public.htg_speaking_events
  FOR ALL USING (true) WITH CHECK (true);
