-- ═══════════════════════════════════════════════════════════════
-- 027 Community Module
-- Społeczność HTG — grupy, posty, komentarze, reakcje, powiadomienia
-- ═══════════════════════════════════════════════════════════════

-- ─── Community Groups ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'private', 'staff_only')),
  type TEXT NOT NULL DEFAULT 'topic'
    CHECK (type IN ('topic', 'post_session', 'staff')),
  source_session_id UUID REFERENCES public.htg_meeting_sessions(id),
  image_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cg_slug ON public.community_groups(slug);
CREATE INDEX IF NOT EXISTS idx_cg_visibility ON public.community_groups(visibility) WHERE is_archived = false;

-- ─── Community Memberships ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'moderator', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_user_group ON public.community_memberships(user_id, group_id);
CREATE INDEX IF NOT EXISTS idx_cm_group ON public.community_memberships(group_id);

-- ─── Community Posts ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content JSONB NOT NULL,
  content_text TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  type TEXT NOT NULL DEFAULT 'native'
    CHECK (type IN ('native', 'migrated_from_fb')),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  comment_count INTEGER NOT NULL DEFAULT 0,
  reaction_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kluczowy indeks dla feedu: posty przypięte na górze, potem wg aktywności
CREATE INDEX IF NOT EXISTS idx_cp_feed
  ON public.community_posts(group_id, is_pinned DESC, last_activity_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cp_user ON public.community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_cp_group_activity ON public.community_posts(group_id, last_activity_at DESC)
  WHERE deleted_at IS NULL;

-- ─── Community Comments ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  content_text TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_post ON public.community_comments(post_id, created_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cc_group ON public.community_comments(group_id);

-- ─── Community Reactions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('post', 'comment')),
  target_id UUID NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'heart',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_cr_target ON public.community_reactions(target_type, target_id);

-- ─── Community Notifications ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL
    CHECK (type IN ('comment', 'reaction', 'mention', 'new_post', 'group_invite')),
  target_type TEXT,
  target_id UUID,
  group_id UUID REFERENCES public.community_groups(id) ON DELETE CASCADE,
  grouped_key TEXT,
  actor_ids UUID[] DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cn_user_unread
  ON public.community_notifications(user_id, is_read, created_at DESC);

-- ─── Community Mentions ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmen_user ON public.community_mentions(mentioned_user_id);

-- ─── Community Reports ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('post', 'comment')),
  target_id UUID NOT NULL,
  group_id UUID REFERENCES public.community_groups(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reporter_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_crep_status ON public.community_reports(status)
  WHERE status = 'pending';

-- ─── Community Rate Log ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_rate_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crl_user_action
  ON public.community_rate_log(user_id, action_type, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- Trigger Functions
-- ═══════════════════════════════════════════════════════════════

-- 1. Bump post last_activity_at when new comment is added
CREATE OR REPLACE FUNCTION public.community_bump_post()
RETURNS trigger AS $$
BEGIN
  UPDATE public.community_posts
  SET last_activity_at = NEW.created_at
  WHERE id = NEW.post_id AND deleted_at IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_bump_post ON public.community_comments;
CREATE TRIGGER trg_community_bump_post
  AFTER INSERT ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_bump_post();

-- 2. Update comment_count on community_posts
CREATE OR REPLACE FUNCTION public.community_update_comment_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    UPDATE public.community_posts
    SET comment_count = comment_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft delete: was visible, now deleted
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.community_posts
      SET comment_count = GREATEST(comment_count - 1, 0)
      WHERE id = NEW.post_id;
    -- Restore: was deleted, now visible
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.community_posts
      SET comment_count = comment_count + 1
      WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.deleted_at IS NULL THEN
    UPDATE public.community_posts
    SET comment_count = GREATEST(comment_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_comment_count ON public.community_comments;
CREATE TRIGGER trg_community_comment_count
  AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_update_comment_count();

-- 3. Update reaction_count on community_posts / community_comments
CREATE OR REPLACE FUNCTION public.community_update_reaction_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE public.community_posts
      SET reaction_count = reaction_count + 1
      WHERE id = NEW.target_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'post' THEN
      UPDATE public.community_posts
      SET reaction_count = GREATEST(reaction_count - 1, 0)
      WHERE id = OLD.target_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_reaction_count ON public.community_reactions;
CREATE TRIGGER trg_community_reaction_count
  AFTER INSERT OR DELETE ON public.community_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.community_update_reaction_count();

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security — Service Role Bypass
-- (Authorization logic is in Route Handlers, not RLS)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_groups" ON public.community_groups
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_memberships" ON public.community_memberships
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_posts" ON public.community_posts
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_comments" ON public.community_comments
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_reactions" ON public.community_reactions
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_notifications" ON public.community_notifications
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.community_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_mentions" ON public.community_mentions
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_reports" ON public.community_reports
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.community_rate_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_community_rate_log" ON public.community_rate_log
  FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- Supabase Realtime — enable for key tables
-- ═══════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_reactions;
