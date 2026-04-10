-- ═══════════════════════════════════════════════════════════════
-- 063: processing_advisories — advisory artefakty z worker pipeline
--
-- Output z pipeline htg-processing. Każdy advisory to distilled rezultat
-- (nigdy raw transcript) zapisywany jako draft przez worker przez
-- POST /api/processing/advisory, akceptowany lub odrzucany przez staff.
--
-- Per-typ constraints + partial unique indexes zapewniają integralność:
--
-- UC2 (mapa_uwarunkowan):
--   - subject_user_id NOT NULL, meeting/proposal/group_index NULL
--   - Unique per (subject_user_id, version)
--   - Unique "accepted" per subject_user_id — max 1 accepted Mapa per user
--
-- UC1 (group_enrichment):
--   - subject_meeting_id NOT NULL
--   - subject_group_proposal_id NOT NULL
--   - subject_user_id NULL
--   - group_index NOT NULL (numer grupy w proposal, 0-N)
--   - Unique per (subject_group_proposal_id, group_index, version) — wiele
--     advisory per job (po jednej na grupę z |analyzable_g| >= K)
--   - Unique "accepted" per (subject_group_proposal_id, group_index) — max
--     1 accepted per grupa w proposal
--
-- Supersede lifecycle: staff akceptując nową wersję zamienia starą accepted
-- na 'superseded' w jednej transakcji. Partial unique index wymusza
-- że nigdy nie istnieją dwa accepted dla tego samego (proposal, group_index)
-- ani (user_id).
--
-- error_code CHECK rozróżnia statusy merytoryczne (draft/accepted/rejected)
-- od operacyjnych (expired z error_code — np. orphan_draft_gc, superseded).
--
-- FK do processing_jobs.processing_run_id NIE jest enforced (processing_jobs
-- może zostać pokasowane po DONE retention — zostawiamy jako audit trail).
--
-- Patrz: docs/processing-service-plan.md §8
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.processing_advisories (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_type             TEXT NOT NULL CHECK (advisory_type IN (
    'group_enrichment',
    'mapa_uwarunkowan'
  )),

  subject_user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_meeting_id        UUID REFERENCES public.htg_meetings(id) ON DELETE CASCADE,
  subject_group_proposal_id UUID REFERENCES public.htg_group_proposals(id) ON DELETE CASCADE,
  group_index               INT,  -- UC1 only: 0..N

  version                   INT NOT NULL,
  doctrine_version          TEXT NOT NULL,

  -- Pointer do worker processing_run_id (nie enforced FK —
  -- processing_jobs może zostać pokasowane po retention)
  processing_run_id         UUID NOT NULL,

  payload                   JSONB NOT NULL,  -- distilled advisory; NIGDY raw transcript

  accepted_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at               TIMESTAMPTZ,

  status                    TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'accepted',
    'rejected',
    'superseded',
    'expired'
  )),
  error_code                TEXT,  -- kod operacyjny (orphan_draft_gc, ...); NULL dla merytorycznych

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Per-typ wymagania pól [v12] ─────────────────────────────

  -- UC2: subject_user_id NOT NULL, meeting/proposal/group_index NULL
  CONSTRAINT mapa_subject_required CHECK (
    advisory_type <> 'mapa_uwarunkowan' OR (
      subject_user_id IS NOT NULL
      AND subject_meeting_id IS NULL
      AND subject_group_proposal_id IS NULL
      AND group_index IS NULL
    )
  ),

  -- UC1: meeting + proposal + group_index, subject_user_id NULL
  CONSTRAINT group_subject_required CHECK (
    advisory_type <> 'group_enrichment' OR (
      subject_meeting_id IS NOT NULL
      AND subject_group_proposal_id IS NOT NULL
      AND subject_user_id IS NULL
      AND group_index IS NOT NULL
    )
  ),

  -- ── error_code semantyka [v8] ───────────────────────────────
  -- NULL dla stanów merytorycznych (draft/accepted/rejected/superseded)
  -- NOT NULL dla operacyjnych (expired z kodem typu orphan_draft_gc)
  CONSTRAINT error_code_semantics CHECK (
    (status IN ('draft', 'accepted', 'rejected', 'superseded') AND error_code IS NULL)
    OR (status = 'expired' AND error_code IS NOT NULL)
  )
);

COMMENT ON TABLE public.processing_advisories IS
  'Advisory artefakty z pipeline htg-processing. UC2: singular Mapa per user. '
  'UC1: multi-advisory per group_proposal (linkowane przez processing_job_advisories, mig 064). '
  'status=''accepted'' chronione przez partial unique indexy (max 1 per subject). '
  'Patrz: docs/processing-service-plan.md §8';


-- ── NULL-safe unikalność per typ [v3] ─────────────────────────
-- PostgreSQL NULL <> NULL w UNIQUE constraints, więc używamy partial index
-- per advisory_type — gwarantuje unique tylko na wierszach danego typu.

-- UC2: jedna advisory (user, version) — singular
CREATE UNIQUE INDEX IF NOT EXISTS processing_advisories_mapa_uniq
  ON public.processing_advisories (subject_user_id, version)
  WHERE advisory_type = 'mapa_uwarunkowan';

-- UC1: jedna advisory per (proposal, group_index, version) — multi-advisory
CREATE UNIQUE INDEX IF NOT EXISTS processing_advisories_group_uniq
  ON public.processing_advisories (subject_group_proposal_id, group_index, version)
  WHERE advisory_type = 'group_enrichment';


-- ── "Max 1 accepted" constraints [v14] ────────────────────────
-- DB-level ochrona przed race na akceptację (dwóch adminów jednocześnie
-- klika accept dla dwóch draft versions tej samej grupy/usera).

-- UC1: max 1 accepted per (proposal, group_index)
CREATE UNIQUE INDEX IF NOT EXISTS processing_advisories_group_accepted_uniq
  ON public.processing_advisories (subject_group_proposal_id, group_index)
  WHERE advisory_type = 'group_enrichment' AND status = 'accepted';

-- UC2: max 1 accepted Mapa per user
CREATE UNIQUE INDEX IF NOT EXISTS processing_advisories_mapa_accepted_uniq
  ON public.processing_advisories (subject_user_id)
  WHERE advisory_type = 'mapa_uwarunkowan' AND status = 'accepted';


-- ── Reconcile support [v5] ────────────────────────────────────
CREATE INDEX IF NOT EXISTS processing_advisories_run_id_idx
  ON public.processing_advisories (processing_run_id);


-- ── FK processing_jobs.result_advisory_id → processing_advisories ──
-- Dodajemy teraz (mig 062 utworzyło kolumnę ale FK był deferred do tej migracji,
-- bo processing_advisories jeszcze nie istniało).
ALTER TABLE public.processing_jobs
  ADD CONSTRAINT processing_jobs_result_advisory_fk
  FOREIGN KEY (result_advisory_id) REFERENCES public.processing_advisories(id) ON DELETE SET NULL;


-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE public.processing_advisories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'processing_advisories'
      AND policyname = 'service_all_processing_advisories'
  ) THEN
    CREATE POLICY "service_all_processing_advisories" ON public.processing_advisories
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'processing_advisories'
      AND policyname = 'admin_read_processing_advisories'
  ) THEN
    CREATE POLICY "admin_read_processing_advisories" ON public.processing_advisories
      FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
