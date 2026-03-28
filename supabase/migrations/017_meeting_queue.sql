-- 017: HTG Meeting Queue — kolejka zgłoszeń do mówienia
-- IDEMPOTENT — safe to run multiple times

CREATE TABLE IF NOT EXISTS public.htg_meeting_queue (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.htg_meeting_sessions(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT        NOT NULL DEFAULT '',
  queued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_done      BOOLEAN     NOT NULL DEFAULT false,
  done_at      TIMESTAMPTZ,
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_htg_queue_session ON public.htg_meeting_queue(session_id, is_done, queued_at);

ALTER TABLE public.htg_meeting_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_queue" ON public.htg_meeting_queue;
CREATE POLICY "service_all_queue" ON public.htg_meeting_queue FOR ALL USING (true) WITH CHECK (true);
