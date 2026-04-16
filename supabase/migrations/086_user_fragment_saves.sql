-- Migration 086: User fragment saves — polymorphic source (session_template XOR booking_recording)
-- ================================================================================================
-- Stores user references to audio fragments. Two save types (fragment_type):
--   'predefined' — references an admin-segmented session_fragment (Type A)
--   'custom'     — user-defined start/end bounds (Type B)
--
-- Two source media types (XOR):
--   session_template_id NOT NULL  — fragment from VOD library session
--   booking_recording_id NOT NULL — fragment from user's own session recording
--
-- Business invariants (DB-enforced):
--   * Exactly one source medium (ufs_source_xor)
--   * Predefined type only with session_template source (ufs_predefined_requires_session)
--   * Three-state content validity (ufs_content_valid):
--       A) predefined live  — session_fragment_id NOT NULL, fallback_* filled, no custom_*
--       B) predefined orphan— session_fragment_id NULL,     fallback_* filled, no custom_*
--          (fragment was deleted by admin; fallback_* preserve last known bounds)
--       C) custom           — session_fragment_id NULL, fallback_* NULL, custom_* filled
--   * session_fragment_id (when set) must belong to same session as save
--       (trigger ufs_fragment_session_consistency — replaces unsafe composite FK+SET NULL)
--
-- Share invariant (DB-enforced after 087 adds category_shares):
--   * booking_recording saves cannot be placed in shared categories
--       (trigger ufs_booking_not_in_shared — created in migration 087)

CREATE TABLE IF NOT EXISTS public.user_fragment_saves (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source medium: exactly one must be non-null
  session_template_id  UUID        REFERENCES public.session_templates(id) ON DELETE CASCADE,
  booking_recording_id UUID        REFERENCES public.booking_recordings(id) ON DELETE CASCADE,

  -- Fragment type
  fragment_type        TEXT        NOT NULL CHECK (fragment_type IN ('predefined', 'custom')),

  -- Predefined: FK to admin-segmented fragment. SET NULL when fragment deleted (→ orphan state).
  session_fragment_id  UUID,

  -- Custom (Type B) bounds
  custom_start_sec     NUMERIC(10,3),
  custom_end_sec       NUMERIC(10,3),
  custom_title         TEXT,

  -- Predefined snapshot (preserved when fragment deleted — orphan state)
  fallback_start_sec   NUMERIC(10,3),
  fallback_end_sec     NUMERIC(10,3),

  note                 TEXT,
  category_id          UUID        REFERENCES public.user_categories(id) ON DELETE SET NULL,
  is_favorite          BOOLEAN     NOT NULL DEFAULT false,
  last_played_at       TIMESTAMPTZ,
  play_count           INT         NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Cross-field constraints ──────────────────────────────────────────────

  -- Exactly one source medium
  CONSTRAINT ufs_source_xor CHECK (
    (session_template_id IS NOT NULL AND booking_recording_id IS NULL)
    OR
    (session_template_id IS NULL AND booking_recording_id IS NOT NULL)
  ),

  -- Predefined fragment type requires session_template source
  -- (admin segmentation does not apply to personal recordings)
  CONSTRAINT ufs_predefined_requires_session CHECK (
    fragment_type = 'custom'
    OR (fragment_type = 'predefined' AND session_template_id IS NOT NULL)
  ),

  -- Three-state content validity
  CONSTRAINT ufs_content_valid CHECK (
    -- A) Predefined, live (session_fragment_id FK active)
    (fragment_type = 'predefined'
      AND session_fragment_id IS NOT NULL
      AND fallback_start_sec IS NOT NULL
      AND fallback_end_sec   IS NOT NULL
      AND fallback_end_sec   > fallback_start_sec
      AND custom_start_sec IS NULL
      AND custom_end_sec   IS NULL
      AND custom_title     IS NULL)
    OR
    -- B) Predefined, orphan (fragment deleted; bounds preserved in fallback_*)
    (fragment_type = 'predefined'
      AND session_fragment_id IS NULL
      AND fallback_start_sec IS NOT NULL
      AND fallback_end_sec   IS NOT NULL
      AND fallback_end_sec   > fallback_start_sec
      AND custom_start_sec IS NULL
      AND custom_end_sec   IS NULL
      AND custom_title     IS NULL)
    OR
    -- C) Custom (from session_template or booking_recording)
    (fragment_type = 'custom'
      AND session_fragment_id  IS NULL
      AND fallback_start_sec   IS NULL
      AND fallback_end_sec     IS NULL
      AND custom_start_sec     IS NOT NULL
      AND custom_end_sec       IS NOT NULL
      AND custom_end_sec       > custom_start_sec)
  )
);

-- ── Simple FK — only session_fragment_id; SET NULL preserves session_template_id ──
-- (composite FK with SET NULL is unsupported / semantically wrong in Postgres)
ALTER TABLE public.user_fragment_saves
  ADD CONSTRAINT ufs_fragment_fk
  FOREIGN KEY (session_fragment_id)
  REFERENCES public.session_fragments(id)
  ON DELETE SET NULL;

-- ── Trigger: session_fragment_id must belong to the same session as save ──
-- Replaces the composite FK + ON DELETE SET NULL that would have NULL-ed session_template_id.
CREATE OR REPLACE FUNCTION public.ufs_check_fragment_session_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_fragment_session UUID;
BEGIN
  -- Only validate when session_fragment_id is being set
  IF NEW.session_fragment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT session_template_id INTO v_fragment_session
  FROM public.session_fragments
  WHERE id = NEW.session_fragment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_fragment_id references non-existent fragment'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_fragment_session IS DISTINCT FROM NEW.session_template_id THEN
    RAISE EXCEPTION
      'session_fragment_id (%) belongs to session % but save has session_template_id %',
      NEW.session_fragment_id, v_fragment_session, NEW.session_template_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ufs_fragment_session_consistency ON public.user_fragment_saves;
CREATE TRIGGER ufs_fragment_session_consistency
  BEFORE INSERT OR UPDATE OF session_fragment_id, session_template_id
  ON public.user_fragment_saves
  FOR EACH ROW EXECUTE FUNCTION public.ufs_check_fragment_session_consistency();

-- ── updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_fragment_saves_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ufs_touch_updated_at ON public.user_fragment_saves;
CREATE TRIGGER ufs_touch_updated_at
  BEFORE UPDATE ON public.user_fragment_saves
  FOR EACH ROW EXECUTE FUNCTION public.user_fragment_saves_set_updated_at();

-- ── Indexes ────────────────────────────────────────────────────────────────

-- One predefined save per fragment per user (when FK is live)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ufs_unique_predefined
  ON public.user_fragment_saves(user_id, session_fragment_id)
  WHERE session_fragment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ufs_user_created
  ON public.user_fragment_saves(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ufs_user_category
  ON public.user_fragment_saves(user_id, category_id);

-- ⭐ Ulubione virtual category filter
CREATE INDEX IF NOT EXISTS idx_ufs_user_favorite
  ON public.user_fragment_saves(user_id)
  WHERE is_favorite = true;

-- 🎙 Twoje Nagrania Sesji virtual category filter
CREATE INDEX IF NOT EXISTS idx_ufs_user_recording
  ON public.user_fragment_saves(user_id)
  WHERE booking_recording_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ufs_session
  ON public.user_fragment_saves(session_template_id);

CREATE INDEX IF NOT EXISTS idx_ufs_recording
  ON public.user_fragment_saves(booking_recording_id);

CREATE INDEX IF NOT EXISTS idx_ufs_user_last_played
  ON public.user_fragment_saves(user_id, last_played_at NULLS FIRST);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.user_fragment_saves ENABLE ROW LEVEL SECURITY;

-- User sees and manages only their own saves
CREATE POLICY ufs_own ON public.user_fragment_saves
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ufs_read_via_share policy is added in migration 087 (after category_shares exists)
-- ufs_booking_not_in_shared trigger is added in migration 087

COMMENT ON TABLE public.user_fragment_saves IS
  'User-saved fragment references. Polymorphic: session_template (VOD) XOR booking_recording (personal). Three states: predefined-live, predefined-orphan, custom. Share of booking_recording saves blocked at DB level (trigger in 087).';

COMMENT ON COLUMN public.user_fragment_saves.session_fragment_id IS
  'FK to session_fragments. SET NULL when admin deletes fragment — save enters orphan state; fallback_* preserve last known bounds. session_template_id is NOT cleared (ufs_content_valid orphan branch).';

COMMENT ON COLUMN public.user_fragment_saves.fallback_start_sec IS
  'Snapshot of fragment bounds at save time. Preserved on orphan (session_fragment_id SET NULL). Null for custom saves.';
