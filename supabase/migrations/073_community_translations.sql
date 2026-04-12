-- Migration 073: Community auto-translation support
-- ===================================================================

-- ─── 1. Add source_locale to posts and comments ────────────────

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS source_locale TEXT;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS source_locale TEXT;

-- ─── 2. Post translations ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_post_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('pl', 'en', 'de', 'pt')),
  content JSONB NOT NULL,
  content_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'translating', 'done', 'failed', 'stale')),
  translated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_cpt_post ON public.community_post_translations(post_id);
CREATE INDEX IF NOT EXISTS idx_cpt_status ON public.community_post_translations(status)
  WHERE status IN ('pending', 'failed');

-- ─── 3. Comment translations ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_comment_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('pl', 'en', 'de', 'pt')),
  content JSONB NOT NULL,
  content_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'translating', 'done', 'failed', 'stale')),
  translated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_cct_comment ON public.community_comment_translations(comment_id);
CREATE INDEX IF NOT EXISTS idx_cct_status ON public.community_comment_translations(status)
  WHERE status IN ('pending', 'failed');

-- ─── 4. RLS ────────────────────────────────────────────────────
-- No public SELECT policies — read only through service role in API routes
-- (same model as community_posts: API uses service role + requireGroupAccess)

ALTER TABLE public.community_post_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comment_translations ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so no explicit policies needed for background jobs.
-- The API routes use service role client (createSupabaseServiceRole).
