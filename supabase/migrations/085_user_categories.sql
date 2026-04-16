-- Migration 085: User categories — personal fragment organization tree
-- =====================================================================
-- Each user can build their own tree (max 3 levels deep) to organize
-- user_fragment_saves. Root categories have parent_id IS NULL.
--
-- Virtual default categories (⭐ Ulubione, 🎙 Twoje Nagrania Sesji,
-- 🔥 Impuls) are NOT stored here — they are UI-only filters on
-- user_fragment_saves.is_favorite / booking_recording_id / session_fragments.is_impulse.

CREATE TABLE IF NOT EXISTS public.user_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES public.user_categories(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT,
  color       TEXT,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent self-reference
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_user_categories_user_parent
  ON public.user_categories(user_id, parent_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_categories_user_slug
  ON public.user_categories(user_id, slug)
  WHERE slug IS NOT NULL;

-- updated_at trigger (inline — no global set_updated_at in this repo)
CREATE OR REPLACE FUNCTION public.user_categories_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_categories_touch_updated_at ON public.user_categories;
CREATE TRIGGER user_categories_touch_updated_at
  BEFORE UPDATE ON public.user_categories
  FOR EACH ROW EXECUTE FUNCTION public.user_categories_set_updated_at();

-- Depth guard: max 3 levels (root = 0, child = 1, grandchild = 2)
-- Trigger counts parent hops; at depth >= 3 raises exception.
CREATE OR REPLACE FUNCTION public.user_categories_check_depth()
RETURNS TRIGGER AS $$
DECLARE
  v_depth   INT  := 0;
  v_current UUID := NEW.parent_id;
BEGIN
  WHILE v_current IS NOT NULL LOOP
    v_depth := v_depth + 1;
    IF v_depth > 2 THEN
      RAISE EXCEPTION 'Category nesting exceeds maximum depth of 3'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO v_current
    FROM public.user_categories
    WHERE id = v_current;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_categories_depth_guard ON public.user_categories;
CREATE TRIGGER user_categories_depth_guard
  BEFORE INSERT OR UPDATE OF parent_id ON public.user_categories
  FOR EACH ROW
  WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION public.user_categories_check_depth();

ALTER TABLE public.user_categories ENABLE ROW LEVEL SECURITY;

-- User sees only their own categories
CREATE POLICY user_categories_own ON public.user_categories
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.user_categories IS
  'User-owned folder tree for organising fragment saves. Max 3 levels. Virtual categories (Ulubione, Twoje Nagrania, Impuls) are UI-only filters, not stored here.';
