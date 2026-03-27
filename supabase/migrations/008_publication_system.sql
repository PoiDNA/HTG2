-- ============================================================
-- Migration 008: System publikacji sesji audio (DAW)
-- Uruchom w: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── 1. monthly_sets ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.monthly_sets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  month       TEXT        NOT NULL,        -- format: YYYY-MM
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_sets_month ON public.monthly_sets(month DESC);

-- ─── 2. session_publications ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_publications (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT,
  live_session_id       UUID        REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  monthly_set_id        UUID        REFERENCES public.monthly_sets(id)  ON DELETE SET NULL,

  status                TEXT        NOT NULL DEFAULT 'raw'
                        CHECK (status IN ('raw','editing','edited','mastering','published')),

  -- Source audio tracks (raw from LiveKit or manual upload)
  source_composite_url  TEXT,
  source_tracks         JSONB       NOT NULL DEFAULT '[]',

  -- Editor output tracks
  edited_tracks         JSONB       NOT NULL DEFAULT '[]',
  edited_composite_url  TEXT,

  -- Auto-edit AI pipeline output
  auto_cleaned_tracks   JSONB       NOT NULL DEFAULT '[]',
  auto_mixed_url        TEXT,
  auto_edit_status      JSONB,               -- AutoEditMetadata JSON

  -- Mastering
  mastered_url          TEXT,
  mastered_bunny_video_id TEXT,

  -- Assignment & workflow
  assigned_editor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  editor_notes          TEXT,
  admin_notes           TEXT,
  marked_ready_at       TIMESTAMPTZ,
  marked_ready_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at          TIMESTAMPTZ,
  published_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_pubs_status       ON public.session_publications(status);
CREATE INDEX IF NOT EXISTS idx_session_pubs_monthly_set  ON public.session_publications(monthly_set_id);
CREATE INDEX IF NOT EXISTS idx_session_pubs_editor       ON public.session_publications(assigned_editor_id);
CREATE INDEX IF NOT EXISTS idx_session_pubs_created      ON public.session_publications(created_at DESC);

-- ─── 3. Helper function (SECURITY DEFINER — bypasses RLS) ───

CREATE OR REPLACE FUNCTION public.get_my_pub_role()
RETURNS TEXT AS $$
  SELECT COALESCE(role, 'user')
  FROM public.profiles
  WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─── 4. RLS — monthly_sets ───────────────────────────────────

ALTER TABLE public.monthly_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_sets_pub_roles" ON public.monthly_sets;
CREATE POLICY "monthly_sets_pub_roles" ON public.monthly_sets
  FOR ALL
  USING (public.get_my_pub_role() IN ('admin','moderator','publikacja'))
  WITH CHECK (public.get_my_pub_role() IN ('admin','moderator'));

-- ─── 5. RLS — session_publications ──────────────────────────

ALTER TABLE public.session_publications ENABLE ROW LEVEL SECURITY;

-- Admin/moderator: pełny dostęp
DROP POLICY IF EXISTS "sp_admin_all" ON public.session_publications;
CREATE POLICY "sp_admin_all" ON public.session_publications
  FOR ALL
  USING (public.get_my_pub_role() IN ('admin','moderator'))
  WITH CHECK (public.get_my_pub_role() IN ('admin','moderator'));

-- Edytor: odczyt własnych + nieprzypisanych
DROP POLICY IF EXISTS "sp_editor_select" ON public.session_publications;
CREATE POLICY "sp_editor_select" ON public.session_publications
  FOR SELECT
  USING (
    public.get_my_pub_role() = 'publikacja'
    AND (assigned_editor_id IS NULL OR assigned_editor_id = auth.uid())
  );

-- Edytor: edycja własnych
DROP POLICY IF EXISTS "sp_editor_update" ON public.session_publications;
CREATE POLICY "sp_editor_update" ON public.session_publications
  FOR UPDATE
  USING (
    public.get_my_pub_role() = 'publikacja'
    AND assigned_editor_id = auth.uid()
  )
  WITH CHECK (
    public.get_my_pub_role() = 'publikacja'
    AND assigned_editor_id = auth.uid()
  );

-- Edytor: może tworzyć sesje
DROP POLICY IF EXISTS "sp_editor_insert" ON public.session_publications;
CREATE POLICY "sp_editor_insert" ON public.session_publications
  FOR INSERT
  WITH CHECK (public.get_my_pub_role() IN ('admin','moderator','publikacja'));

-- ─── 6. Ustaw rolę admina ─────────────────────────────────────
-- Upewnij się że admin ma role='admin' w profiles

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'htg@htg.cyou'
  AND (role IS NULL OR role != 'admin');

-- ─── 7. Przykładowy zestaw miesięczny do testów ───────────────

INSERT INTO public.monthly_sets (title, month, description)
VALUES
  ('Sesje — Marzec 2026', '2026-03', 'Zestaw sesji grupowych i indywidualnych za marzec'),
  ('Sesje — Kwiecień 2026', '2026-04', NULL)
ON CONFLICT DO NOTHING;
