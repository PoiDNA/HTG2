-- Migration 084: Session fragments — predefined (Type A)
-- =====================================================================
-- Admin-segmented fragments of published session_templates. Fragments
-- are *references* (start/end seconds) over the existing Bunny Stream
-- media — no file cutting. Users save references to their own
-- user_fragment_saves (migration 086).
--
-- Invariants enforced at DB level:
--   * start < end, ordinal >= 1 (CHECK)
--   * no overlapping fragments per session (EXCLUDE USING gist)
--   * ordinal unique per session, DEFERRABLE — swap-reorder allowed
--     within a single transaction via SET CONSTRAINTS ALL DEFERRED
--   * composite UNIQUE (id, session_template_id) — supports composite FK
--     from user_fragment_saves so a save cannot reference a fragment of
--     a different session
--
-- Read access: authenticated users can SELECT fragments only when the
-- parent session_template is published (no spoilers for in-progress
-- templates). Admin writes go through service_role (bypasses RLS).

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.session_fragments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_template_id  UUID        NOT NULL REFERENCES public.session_templates(id) ON DELETE CASCADE,
  ordinal              SMALLINT    NOT NULL CHECK (ordinal >= 1),
  start_sec            NUMERIC(10,3) NOT NULL CHECK (start_sec >= 0),
  end_sec              NUMERIC(10,3) NOT NULL,
  title                TEXT        NOT NULL,
  title_i18n           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  description_i18n     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by           UUID        REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_sec > start_sec),

  -- Ordinal unique per session. DEFERRABLE pozwala na swap (1<->2)
  -- w jednej transakcji z SET CONSTRAINTS ALL DEFERRED.
  CONSTRAINT session_fragments_ordinal_unique
    UNIQUE (session_template_id, ordinal)
    DEFERRABLE INITIALLY IMMEDIATE,

  -- Composite UNIQUE wspiera composite FK z user_fragment_saves.
  CONSTRAINT session_fragments_id_session_unique
    UNIQUE (id, session_template_id),

  -- Brak overlapów w ramach sesji (gapy dozwolone).
  CONSTRAINT session_fragments_no_overlap
    EXCLUDE USING gist (
      session_template_id WITH =,
      numrange(start_sec, end_sec, '[)') WITH &&
    )
);

CREATE INDEX IF NOT EXISTS idx_session_fragments_session_ord
  ON public.session_fragments(session_template_id, ordinal);

CREATE INDEX IF NOT EXISTS idx_session_fragments_session_start
  ON public.session_fragments(session_template_id, start_sec);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.session_fragments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_fragments_touch_updated_at ON public.session_fragments;
CREATE TRIGGER session_fragments_touch_updated_at
  BEFORE UPDATE ON public.session_fragments
  FOR EACH ROW EXECUTE FUNCTION public.session_fragments_set_updated_at();

ALTER TABLE public.session_fragments ENABLE ROW LEVEL SECURITY;

-- Authenticated users widzą tylko fragmenty opublikowanych sesji
-- (blokuje spoilery dla szablonów in-progress).
CREATE POLICY session_fragments_read_published ON public.session_fragments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_templates st
      WHERE st.id = session_fragments.session_template_id
        AND st.is_published = true
    )
  );

-- Admin write odbywa się przez service_role (natywny bypass RLS).

COMMENT ON TABLE public.session_fragments IS
  'Admin-segmentowane fragmenty opublikowanych session_templates (Type A). Start/end sekundy nad istniejącym mediumem Bunny — bez cięcia plików.';

COMMENT ON CONSTRAINT session_fragments_no_overlap ON public.session_fragments IS
  'Fragmenty w ramach jednej sesji nie mogą się nakładać. Gapy dozwolone.';

COMMENT ON CONSTRAINT session_fragments_ordinal_unique ON public.session_fragments IS
  'Ordinal unikalny per sesja. DEFERRABLE — swap w transakcji z SET CONSTRAINTS ALL DEFERRED.';

COMMENT ON CONSTRAINT session_fragments_id_session_unique ON public.session_fragments IS
  'Composite unique wspiera composite FK z user_fragment_saves — save nie może wskazywać fragmentu z innej sesji.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Impuls — admin-curated featured fragments
-- ─────────────────────────────────────────────────────────────────────────────
-- Admin flagi is_impulse=true na wybranych fragmentach. Widoczne dla każdego
-- zalogowanego usera (bez subskrypcji) jako lista „🔥 Impuls" — tylko
-- browsing. Playback wymaga fragment_access entitlement (lub admin bypass).

ALTER TABLE public.session_fragments
  ADD COLUMN IF NOT EXISTS is_impulse    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impulse_order INT;

-- Composite sort: jawna kolejność → data pola, potem session + ordinal
DROP INDEX IF EXISTS idx_session_fragments_impulse;
CREATE INDEX idx_session_fragments_impulse_sort
  ON public.session_fragments(impulse_order NULLS LAST, session_template_id, ordinal)
  WHERE is_impulse = true;
