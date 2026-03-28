-- Speaking queue for HTG meetings
CREATE TABLE public.htg_meeting_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.htg_meeting_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  UNIQUE(session_id, user_id)  -- one active entry per user per session
);

CREATE INDEX idx_htg_queue_session ON public.htg_meeting_queue(session_id, is_done, queued_at);
