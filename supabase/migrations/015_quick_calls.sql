-- 015: Quick Calls — bezpośrednie połączenia audio/video
-- IDEMPOTENT — safe to run multiple times

CREATE TABLE IF NOT EXISTS public.quick_calls (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name   TEXT        NOT NULL UNIQUE,
  status      TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'ended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.quick_call_participants (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id      UUID        NOT NULL REFERENCES public.quick_calls(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  display_name TEXT,
  joined_at    TIMESTAMPTZ,
  left_at      TIMESTAMPTZ,
  UNIQUE (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_quick_calls_created_by  ON public.quick_calls (created_by);
CREATE INDEX IF NOT EXISTS idx_quick_calls_status      ON public.quick_calls (status);
CREATE INDEX IF NOT EXISTS idx_qcp_call_id             ON public.quick_call_participants (call_id);
CREATE INDEX IF NOT EXISTS idx_qcp_user_id             ON public.quick_call_participants (user_id);

ALTER TABLE public.quick_calls             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_call_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qc_select"  ON public.quick_calls;
DROP POLICY IF EXISTS "qcp_select" ON public.quick_call_participants;

CREATE POLICY "qc_select" ON public.quick_calls FOR SELECT USING (
  auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.quick_call_participants
    WHERE call_id = id AND user_id = auth.uid()
  )
);

CREATE POLICY "qcp_select" ON public.quick_call_participants FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.quick_calls qc
    WHERE qc.id = call_id
      AND (
        qc.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.quick_call_participants qcp2
          WHERE qcp2.call_id = call_id AND qcp2.user_id = auth.uid()
        )
      )
  )
);
