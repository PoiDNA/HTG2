-- ═══════════════════════════════════════════════════════════════
-- 028 Community Phase 2
-- Thread subscriptions, push notifications, digest tracking,
-- voice note support, link previews
-- ═══════════════════════════════════════════════════════════════

-- ─── Thread Subscriptions ─────────────────────────────────────
-- Users who comment on a post automatically become "watchers"
-- and receive notifications about new comments on that post.

CREATE TABLE IF NOT EXISTS public.community_thread_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_cts_post ON public.community_thread_subscriptions(post_id);
CREATE INDEX IF NOT EXISTS idx_cts_user ON public.community_thread_subscriptions(user_id);

ALTER TABLE public.community_thread_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_thread_subscriptions"
  ON public.community_thread_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ─── Push Subscriptions ──────────────────────────────────────
-- Web Push VAPID subscriptions for browser notifications

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,                   -- { p256dh, auth }
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_ps_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_push_subscriptions"
  ON public.push_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ─── Digest Tracking ─────────────────────────────────────────
-- Track when each user last received a digest email

CREATE TABLE IF NOT EXISTS public.community_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_type TEXT NOT NULL DEFAULT 'weekly'
    CHECK (digest_type IN ('daily', 'weekly')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  post_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cdl_user ON public.community_digest_log(user_id, sent_at DESC);

ALTER TABLE public.community_digest_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_digest_log"
  ON public.community_digest_log FOR ALL USING (true) WITH CHECK (true);

-- ─── User Community Preferences ──────────────────────────────
-- Per-user notification preferences

CREATE TABLE IF NOT EXISTS public.community_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_digest TEXT NOT NULL DEFAULT 'weekly'
    CHECK (email_digest IN ('off', 'daily', 'weekly')),
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  push_comments BOOLEAN NOT NULL DEFAULT true,
  push_mentions BOOLEAN NOT NULL DEFAULT true,
  push_reactions BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.community_user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_user_preferences"
  ON public.community_user_preferences FOR ALL USING (true) WITH CHECK (true);

-- ─── Auto-subscribe trigger ──────────────────────────────────
-- When a user comments on a post, auto-subscribe them to the thread

CREATE OR REPLACE FUNCTION public.community_auto_subscribe_thread()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.community_thread_subscriptions (user_id, post_id)
  VALUES (NEW.user_id, NEW.post_id)
  ON CONFLICT (user_id, post_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_auto_subscribe ON public.community_comments;
CREATE TRIGGER trg_community_auto_subscribe
  AFTER INSERT ON public.community_comments
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.community_auto_subscribe_thread();

-- ─── Enable Realtime for new tables ──────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_thread_subscriptions;
