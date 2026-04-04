-- ============================================================
-- 039: Session listens — user marks VOD sessions as listened
-- ============================================================

CREATE TABLE IF NOT EXISTS public.session_listens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  TEXT        NOT NULL,   -- session_templates.id (TEXT)
  listened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_sl_user    ON public.session_listens(user_id);
CREATE INDEX IF NOT EXISTS idx_sl_session ON public.session_listens(session_id);

ALTER TABLE public.session_listens ENABLE ROW LEVEL SECURITY;

-- Users can read and manage only their own rows
CREATE POLICY "sl_own" ON public.session_listens
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role has unrestricted access
CREATE POLICY "sl_service" ON public.session_listens
  USING (true)
  WITH CHECK (true);
