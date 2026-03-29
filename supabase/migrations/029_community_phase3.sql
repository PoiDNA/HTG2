-- ═══════════════════════════════════════════════════════════════
-- 029 Community Phase 3
-- Polls, @all/@staff mentions, notification aggregation
-- ═══════════════════════════════════════════════════════════════

-- ─── Poll Votes ───────────────────────────────────────────────
-- Atomic votes for polls embedded as attachments in posts.
-- Poll definition lives in community_posts.attachments JSONB.

CREATE TABLE IF NOT EXISTS public.community_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,         -- 0-based index into poll options array
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)              -- One vote per user per poll
);

CREATE INDEX IF NOT EXISTS idx_cpv_post ON public.community_poll_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_cpv_user ON public.community_poll_votes(user_id);

ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_poll_votes"
  ON public.community_poll_votes FOR ALL USING (true) WITH CHECK (true);

-- ─── Mentions: add mention_type for @all/@staff ──────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_mentions' AND column_name = 'mention_type'
  ) THEN
    ALTER TABLE public.community_mentions
      ADD COLUMN mention_type TEXT NOT NULL DEFAULT 'user'
        CHECK (mention_type IN ('user', 'all', 'staff'));
  END IF;
END $$;

-- ─── Enable Realtime for poll votes ──────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_poll_votes;
