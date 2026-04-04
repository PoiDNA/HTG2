-- ============================================================
-- 040: Session bookmarks — user marks VOD sessions to return to
-- ============================================================

CREATE TABLE IF NOT EXISTS public.session_bookmarks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_sb_user    ON public.session_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_sb_session ON public.session_bookmarks(session_id);

ALTER TABLE public.session_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sb_own" ON public.session_bookmarks
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "sb_service" ON public.session_bookmarks
  USING (true)
  WITH CHECK (true);
