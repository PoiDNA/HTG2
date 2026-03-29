-- ═══════════════════════════════════════════════════════════════
-- 033 Community Engagement Features
-- Invite links, bookmarks, extended reactions, onboarding config
-- ═══════════════════════════════════════════════════════════════

-- ─── Group Invite Links ───────────────────────────────────────
-- Tokenized invite links for private/public groups.
-- Admin generates a link, anyone with the token can join.

CREATE TABLE IF NOT EXISTS public.community_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  max_uses INTEGER,                      -- null = unlimited
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,                -- null = never expires
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cil_token ON public.community_invite_links(token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cil_group ON public.community_invite_links(group_id);

ALTER TABLE public.community_invite_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_invite_links"
  ON public.community_invite_links FOR ALL USING (true) WITH CHECK (true);

-- ─── Bookmarks (Saved Posts) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_cb_user ON public.community_bookmarks(user_id, created_at DESC);

ALTER TABLE public.community_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_bookmarks"
  ON public.community_bookmarks FOR ALL USING (true) WITH CHECK (true);

-- ─── Extended Reactions ───────────────────────────────────────
-- Expand reaction_type CHECK to support more types.

DO $$ BEGIN
  ALTER TABLE public.community_reactions
    DROP CONSTRAINT IF EXISTS community_reactions_reaction_type_check;
  ALTER TABLE public.community_reactions
    ADD CONSTRAINT community_reactions_reaction_type_check
    CHECK (reaction_type IN ('heart', 'thumbs_up', 'pray', 'wow', 'sad'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── Onboarding: Default groups ──────────────────────────────
-- Flag groups that new users should auto-join on registration.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_groups' AND column_name = 'auto_join'
  ) THEN
    ALTER TABLE public.community_groups
      ADD COLUMN auto_join BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
