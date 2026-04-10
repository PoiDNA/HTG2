-- ═══════════════════════════════════════════════════════════════
-- 062: processing_jobs — central job registry dla htg-processing service
--
-- HTG2 jest jedynym źródłem prawdy dla jobów processing service. Tabela
-- linkuje async runs workera (osobny serwis htg-processing) do subjectów
-- biznesowych po stronie HTG2:
--   - UC1 (group_enrichment) — subject_meeting_id + subject_group_proposal_id
--   - UC2 (mapa_uwarunkowan) — subject_user_id
--
-- Per-typ CHECK constraints wymuszają że:
--   - UC1 MA subject_meeting_id AND subject_group_proposal_id, NIE ma subject_user_id
--   - UC2 MA subject_user_id, NIE ma subject_meeting_id/subject_group_proposal_id
--
-- Kluczowe kolumny:
--   - processing_run_id — UNIQUE UUID dla lease check safety, generated
--     przy create job. Worker używa w Idempotency-Key + authority callback.
--   - current_attempt_id — idempotent lease dla workera. Wszystkie status
--     callbacks (check-in, heartbeat, done, failed) muszą dopasować ten
--     attempt_id do current_attempt_id — inaczej 409 lease_lost.
--   - heartbeat_at — detekcja stuck jobs (cleanup po 5 min bez heartbeatu).
--   - expected_advisory_count — UC1: liczba grup analyzable (ustawione
--     przez worker przez heartbeat callback po batch export). UC2: NULL.
--     Używane przez reconcile do odróżnienia done vs done_partial.
--
-- Statusy:
--   pending  → created przez HTG2, czekający na worker pickup
--   running  → worker wykonał check-in z attempt_id, pipeline w trakcie
--   done     → UC2: jedna advisory lub UC1: komplet expected advisories
--   done_partial → UC1: reconcile znalazł < expected advisories (częściowy)
--   failed   → pipeline error, timeout, lease_lost, consent_missing
--   cancelled → admin cancel w trakcie running (lub inne explicit)
--
-- Unique indexes ograniczają concurrency:
--   - 1 aktywny UC1 job per group_proposal_id (zapobiega podwójnym runom)
--   - 1 aktywny UC2 job per user_id (zapobiega podwójnym Opus runom)
--
-- Patrz: docs/processing-service-plan.md §6.1, §2.2
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type                  TEXT NOT NULL CHECK (job_type IN (
    'group_enrichment',
    'mapa_uwarunkowan'
  )),
  status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'running',
    'done',
    'done_partial',
    'failed',
    'cancelled'
  )),

  -- Processing run identity [v5] — pierwszej klasy kolumna dla reconcile
  -- UNIQUE defensive dla lease check safety (vs manual insert / restore drift)
  processing_run_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  -- Dedykowane subject columns [v4] — NULL/NOT NULL wymuszane przez CHECK per typ
  subject_user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_meeting_id        UUID REFERENCES public.htg_meetings(id) ON DELETE CASCADE,
  subject_group_proposal_id UUID REFERENCES public.htg_group_proposals(id) ON DELETE CASCADE,

  payload                   JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Dla UC2: link do jedynej advisory (singular).
  -- Dla UC1: NULL — wiele advisory linkowane przez processing_job_advisories (mig 064).
  result_advisory_id        UUID,  -- FK dodane w mig 063 po create processing_advisories

  error_code                TEXT,  -- never raw model output — tylko enum codes

  retry_count               INT NOT NULL DEFAULT 0,

  -- Lease ownership [v9] — idempotent check-in dla workera
  current_attempt_id        UUID,

  -- Stuck detection [v5]
  heartbeat_at              TIMESTAMPTZ,

  -- UC1 expected advisory count [v14] — ustawione przez worker w heartbeat
  -- callback PO pipeline analysis (zna już |analyzable_groups|), używane
  -- przez reconcile (done vs done_partial). NULL dla UC2 + UC1 przed ustawieniem.
  -- Jednorazowe ustawienie — HTG2 odrzuca modyfikację po initial set.
  expected_advisory_count   INT,

  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Per-typ subject constraints [v9] ────────────────────────
  -- UC2: tylko subject_user_id
  CONSTRAINT mapa_job_subject CHECK (
    job_type <> 'mapa_uwarunkowan' OR (
      subject_user_id IS NOT NULL
      AND subject_meeting_id IS NULL
      AND subject_group_proposal_id IS NULL
    )
  ),
  -- UC1: subject_meeting_id + subject_group_proposal_id, bez user_id
  CONSTRAINT group_job_subject CHECK (
    job_type <> 'group_enrichment' OR (
      subject_meeting_id IS NOT NULL
      AND subject_group_proposal_id IS NOT NULL
      AND subject_user_id IS NULL
    )
  )
);

COMMENT ON TABLE public.processing_jobs IS
  'Central job registry dla htg-processing service. HTG2 jest jedynym źródłem '
  'prawdy — worker tworzy job przez /jobs/create (UC2) lub HTG2 tworzy przez '
  '/jobs/start (UC1). Worker pickuje z własnej kolejki Arq (nie z tej tabeli). '
  'Patrz: docs/processing-service-plan.md §6.1';


-- ── Indexes ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS processing_jobs_status_idx
  ON public.processing_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS processing_jobs_run_id_idx
  ON public.processing_jobs (processing_run_id);

-- Cleanup stuck job scan: running jobs bez świeżego heartbeatu
CREATE INDEX IF NOT EXISTS processing_jobs_heartbeat_idx
  ON public.processing_jobs (heartbeat_at)
  WHERE status = 'running';

-- Cleanup pending timeout scan
CREATE INDEX IF NOT EXISTS processing_jobs_pending_created_idx
  ON public.processing_jobs (created_at)
  WHERE status = 'pending';

-- Limit 1 aktywny UC1 job per propozycja grup [v3]
CREATE UNIQUE INDEX IF NOT EXISTS processing_jobs_unique_active_uc1
  ON public.processing_jobs (subject_group_proposal_id)
  WHERE job_type = 'group_enrichment' AND status IN ('pending', 'running');

-- Limit 1 aktywny UC2 job per user (zapobiega podwójnym Opus runom)
CREATE UNIQUE INDEX IF NOT EXISTS processing_jobs_unique_active_uc2
  ON public.processing_jobs (subject_user_id)
  WHERE job_type = 'mapa_uwarunkowan' AND status IN ('pending', 'running');


-- ── Auto-update updated_at ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.processing_jobs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS processing_jobs_touch ON public.processing_jobs;
CREATE TRIGGER processing_jobs_touch
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.processing_jobs_touch_updated_at();


-- ── RLS: service_role + admin read ────────────────────────────

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'processing_jobs'
      AND policyname = 'service_all_processing_jobs'
  ) THEN
    CREATE POLICY "service_all_processing_jobs" ON public.processing_jobs
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'processing_jobs'
      AND policyname = 'admin_read_processing_jobs'
  ) THEN
    CREATE POLICY "admin_read_processing_jobs" ON public.processing_jobs
      FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
