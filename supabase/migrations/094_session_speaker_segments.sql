-- Migration 094: Session speaker imports + segments for Moments editor
-- ====================================================================
-- Minimalnie bezpieczny read model pod widoczność mówców / transkrypcję
-- w edytorze Momentów.
--
-- Założenia kontraktu v2:
-- - Read model jest przypięty do session_templates (byt edytora Momentów).
-- - Jeden aktywny import per session_template = jeden spójny zestaw segmentów
--   do renderu w UI.
-- - Segmenty są na pojedynczej osi czasu lokalnej dla audio session_template.
-- - Różne ingest paths (manual / per-track / diarize) nie mieszają się
--   w jednej aktywnej projekcji.
--
-- UWAGA:
-- Ta migracja CELOWO nie dodaje jeszcze mostu session_template <- live_session.
-- Jeśli po weryfikacji okaże się, że brak trwałego pointera, należy dodać go
-- w osobnej, jawnej migracji domenowej zamiast zgadywać tutaj.

-- --------------------------------------------------------------------
-- 1. Importy segmentów
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_speaker_imports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_template_id UUID NOT NULL REFERENCES public.session_templates(id) ON DELETE CASCADE,

  source              TEXT NOT NULL
                      CHECK (source IN (
                        'manual',
                        'livekit_phase2_pertrack',
                        'livekit_phase2_diarize'
                      )),

  status              TEXT NOT NULL DEFAULT 'ready'
                      CHECK (status IN (
                        'processing',
                        'ready',
                        'failed',
                        'superseded'
                      )),

  -- Max 1 aktywny zestaw segmentów do renderu per template.
  is_active           BOOLEAN NOT NULL DEFAULT false,

  -- Idempotencja / śledzenie joba źródłowego.
  source_job_key      TEXT,
  source_ref          TEXT,
  error_code          TEXT,
  error_message       TEXT,

  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT session_speaker_imports_id_template_unique
    UNIQUE (id, session_template_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ssi_one_active_per_template
  ON public.session_speaker_imports(session_template_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ssi_source_job_key
  ON public.session_speaker_imports(session_template_id, source_job_key)
  WHERE source_job_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ssi_template_created
  ON public.session_speaker_imports(session_template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ssi_template_status
  ON public.session_speaker_imports(session_template_id, status, created_at DESC);

COMMENT ON TABLE public.session_speaker_imports IS
  'Spójne zestawy segmentów mówców/transkrypcji dla jednego session_template. Jeden aktywny import per template zasila UI edytora Momentów.';

COMMENT ON COLUMN public.session_speaker_imports.source IS
  'Źródło ingestu: manual, livekit_phase2_pertrack albo livekit_phase2_diarize.';

COMMENT ON COLUMN public.session_speaker_imports.source_job_key IS
  'Klucz idempotencji joba ingestu. NULL dla ręcznych seedów bez zewnętrznego joba.';

COMMENT ON COLUMN public.session_speaker_imports.source_ref IS
  'Opcjonalna referencja do źródła domenowego (np. live_session_id, publication_id, job id providera).';

-- --------------------------------------------------------------------
-- 2. Segmenty mówców / transkrypcji
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_speaker_segments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id           UUID NOT NULL,
  session_template_id UUID NOT NULL REFERENCES public.session_templates(id) ON DELETE CASCADE,

  -- Oś czasu lokalna dla audio session_template.
  start_sec           NUMERIC(10,3) NOT NULL CHECK (start_sec >= 0),
  end_sec             NUMERIC(10,3) NOT NULL CHECK (end_sec > start_sec),

  -- Stabilna tożsamość mówcy w obrębie importu/template.
  speaker_key         TEXT NOT NULL,
  display_name        TEXT,
  role                TEXT
                      CHECK (role IN ('host', 'client', 'assistant', 'unknown')),

  -- NULL = segment bez tekstu (np. sam lane widoczności mówcy).
  text                TEXT,
  confidence          NUMERIC(4,3)
                      CHECK (confidence >= 0 AND confidence <= 1),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT session_speaker_segments_import_template_fk
    FOREIGN KEY (import_id, session_template_id)
    REFERENCES public.session_speaker_imports(id, session_template_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sss_no_exact_duplicates
  ON public.session_speaker_segments(import_id, speaker_key, start_sec, end_sec);

CREATE INDEX IF NOT EXISTS idx_sss_template_start
  ON public.session_speaker_segments(session_template_id, start_sec);

CREATE INDEX IF NOT EXISTS idx_sss_import_start
  ON public.session_speaker_segments(import_id, start_sec);

CREATE INDEX IF NOT EXISTS idx_sss_template_speaker
  ON public.session_speaker_segments(session_template_id, speaker_key);

COMMENT ON TABLE public.session_speaker_segments IS
  'Segmenty mówców/transkrypcji dla aktywnego lub historycznego importu session_template. Oś czasu zawsze lokalna dla audio template.';

COMMENT ON COLUMN public.session_speaker_segments.speaker_key IS
  'Stabilny identyfikator mówcy w obrębie jednego importu/session_template (np. participant identity, spk_0, natalia).';

COMMENT ON COLUMN public.session_speaker_segments.role IS
  'Rola współdzielona z lib/client-analysis/types.ts: host | client | assistant | unknown.';

COMMENT ON COLUMN public.session_speaker_segments.confidence IS
  'Pewność modelu dla automatycznego ingestu. NULL dla danych manualnych lub gdy provider nie zwraca confidence.';

-- --------------------------------------------------------------------
-- 3. updated_at trigger
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.session_speaker_imports_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_speaker_imports_touch_updated_at
  ON public.session_speaker_imports;
CREATE TRIGGER session_speaker_imports_touch_updated_at
  BEFORE UPDATE ON public.session_speaker_imports
  FOR EACH ROW EXECUTE FUNCTION public.session_speaker_imports_set_updated_at();

CREATE OR REPLACE FUNCTION public.session_speaker_segments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_speaker_segments_touch_updated_at
  ON public.session_speaker_segments;
CREATE TRIGGER session_speaker_segments_touch_updated_at
  BEFORE UPDATE ON public.session_speaker_segments
  FOR EACH ROW EXECUTE FUNCTION public.session_speaker_segments_set_updated_at();

-- --------------------------------------------------------------------
-- 4. RLS
-- --------------------------------------------------------------------
-- Na start read model jest używany wyłącznie przez endpoint admin/editor
-- z service_role. Nie włączamy tu jeszcze RLS/policies, żeby nie zgadywać
-- finalnego modelu dostępu dla manual seed UI i przyszłych ingestów.

