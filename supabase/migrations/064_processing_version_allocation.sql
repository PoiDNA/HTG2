-- ═══════════════════════════════════════════════════════════════
-- 064: processing_job_advisories junction + version allocation
--
-- Trzy powiązane konstrukcje dla UC1 multi-advisory workflow:
--
-- 1. processing_job_advisories
--    Junction table UC1: jeden job może mieć wiele advisory (po jednej na
--    grupę z |analyzable_g| >= K). UC2 NIE używa tej tabeli — ma singular
--    processing_jobs.result_advisory_id.
--    UNIQUE(job_id, group_index) zapewnia że jedna grupa ma dokładnie jedną
--    advisory per job. UNIQUE(advisory_id) zapobiega linkowaniu advisory
--    do wielu jobów (defensive).
--
-- 2. advisory_version_counters
--    Monotonicznie rosnący licznik wersji per subject_key. Atomowa alokacja
--    przez ON CONFLICT DO UPDATE, start z next_version=2 żeby pierwsza
--    zaalokowana wersja = 1 (eliminuje off-by-one z v9).
--    subject_key format:
--      UC2: 'mapa_uwarunkowan:{subject_user_id}'
--      UC1: 'group_enrichment:{proposal_id}:{group_index}'
--    UC1 group_index w subject_key gwarantuje że każda grupa w proposal
--    dostaje własną sekwencję wersji (naprawa bugu z v11).
--
-- 3. version_reservations
--    Lock-first pattern: worker wywołuje reserve-version przed write-back
--    advisory żeby uzyskać version (cykl zależności z Idempotency-Key w
--    formacie {run_id}:{type}:{version}). INSERT ON CONFLICT DO NOTHING
--    jest atomowym lockiem — wygrywający increment'uje counter, pozostali
--    czekają przez SELECT FOR UPDATE i czytają już zaalokowaną wartość.
--    Placeholder version=-1 podczas lock — finalny version zapisywany w
--    UPDATE w tej samej transakcji. Cleanup GC dla -1 > 1h jest defensywny
--    (w happy path nigdy nie commitujemy -1 — atomowa transakcja).
--
-- Patrz: docs/processing-service-plan.md §8 (advisory versioning + reservation)
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- 1. processing_job_advisories — junction table dla UC1
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.processing_job_advisories (
  job_id      UUID NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  advisory_id UUID NOT NULL REFERENCES public.processing_advisories(id) ON DELETE CASCADE,
  group_index INT NOT NULL,   -- mirror advisory.group_index dla szybkiego query bez join
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (job_id, advisory_id),

  -- Jedno advisory per grupa per job
  UNIQUE (job_id, group_index),

  -- Defensive: advisory nie może być linkowana do wielu jobów
  UNIQUE (advisory_id)
);

CREATE INDEX IF NOT EXISTS processing_job_advisories_job_idx
  ON public.processing_job_advisories (job_id);

COMMENT ON TABLE public.processing_job_advisories IS
  'Junction table UC1 multi-advisory: jeden job linkuje wiele advisories (po '
  'jednej na grupę z analyzable >= K). UC2 używa singular processing_jobs.result_advisory_id. '
  'UNIQUE(advisory_id) zapobiega cross-linking do wielu jobów. '
  'Patrz: docs/processing-service-plan.md §6.1, §8';


-- ═══════════════════════════════════════════════════════════════
-- 2. advisory_version_counters — monotonic counter per subject
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.advisory_version_counters (
  advisory_type TEXT NOT NULL CHECK (advisory_type IN ('group_enrichment', 'mapa_uwarunkowan')),

  -- Format: [v12]
  --   UC2: 'mapa_uwarunkowan:{subject_user_id}'
  --   UC1: 'group_enrichment:{subject_group_proposal_id}:{group_index}'
  subject_key   TEXT NOT NULL,

  -- next_version = następna dostępna wersja. Start z 2 eliminuje off-by-one:
  -- pierwsza alokacja robi ON CONFLICT DO NOTHING → INSERT z 2 → RETURNING 2-1=1
  -- Druga: UPDATE SET next_version=3 → RETURNING 3-1=2. Itd.
  next_version  INT NOT NULL DEFAULT 2,

  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (advisory_type, subject_key)
);

COMMENT ON TABLE public.advisory_version_counters IS
  'Monotonicznie rosnący licznik wersji per (advisory_type, subject_key). '
  'Atomowa alokacja przez INSERT ON CONFLICT DO UPDATE. Licznik nigdy nie jest '
  'cofany — "dziury" w wersjach są akceptowane (crash między alokacją a write-back). '
  'Patrz: docs/processing-service-plan.md §8';


-- ═══════════════════════════════════════════════════════════════
-- 3. version_reservations — idempotent reservations per run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.version_reservations (
  processing_run_id UUID NOT NULL,
  advisory_type     TEXT NOT NULL CHECK (advisory_type IN ('group_enrichment', 'mapa_uwarunkowan')),
  subject_key       TEXT NOT NULL,

  -- Placeholder -1 podczas lock-first pattern (między INSERT ON CONFLICT
  -- DO NOTHING a finalnym UPDATE z zaalokowaną wersją). W happy path -1
  -- nigdy nie commituje się (atomowa transakcja). Cleanup GC defensywny.
  version           INT NOT NULL,

  reserved_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (processing_run_id, advisory_type, subject_key)
);

-- Index dla cleanup GC (placeholder rows > 1h)
CREATE INDEX IF NOT EXISTS version_reservations_placeholder_idx
  ON public.version_reservations (reserved_at)
  WHERE version = -1;

COMMENT ON TABLE public.version_reservations IS
  'Idempotent reservations wersji dla worker retry safety. Worker POSTuje '
  'reserve-version przed write-back advisory (cykl zależności z Idempotency-Key). '
  'PK (run_id, type, subject_key) zapewnia że powtórne wywołanie z tym samym '
  'runem zwraca tę samą wersję. Patrz: docs/processing-service-plan.md §8';


-- ═══════════════════════════════════════════════════════════════
-- 4. RPC: reserve_advisory_version — atomowa alokacja
-- ═══════════════════════════════════════════════════════════════
-- Lock-first pattern:
-- 1. INSERT version_reservations z placeholder (-1) — ON CONFLICT DO NOTHING
--    jest atomowym lockiem
-- 2. Jeśli wygrany insert (RETURNING) — increment counter + UPDATE wiersza
--    z zaalokowaną wersją, zwróć
-- 3. Jeśli przegrany (conflict) — SELECT FOR UPDATE czekający na winner's
--    commit, potem zwróć już zaalokowaną wartość z max 3 retry × 100ms
--    backoff dla skrajnych przypadków (outside-transaction race)
--
-- UWAGA: lease ownership check (status='running', current_attempt_id match)
-- JEST obowiązkiem warstwy aplikacyjnej (Next.js API handler) PRZED wywołaniem
-- tego RPC — w tej migracji nie walidujemy. Handler odrzuca request z 409
-- lease_lost zanim dojdzie do tego RPC.

CREATE OR REPLACE FUNCTION public.reserve_advisory_version(
  p_processing_run_id UUID,
  p_advisory_type TEXT,
  p_subject_key TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allocated_version INT;
  v_won_lock          BOOLEAN;
  v_retries           INT := 0;
  v_existing          INT;
BEGIN
  -- Krok 1: atomowy lock przez INSERT ON CONFLICT DO NOTHING
  INSERT INTO public.version_reservations (
    processing_run_id, advisory_type, subject_key, version, reserved_at
  )
  VALUES (p_processing_run_id, p_advisory_type, p_subject_key, -1, now())
  ON CONFLICT (processing_run_id, advisory_type, subject_key) DO NOTHING
  RETURNING TRUE INTO v_won_lock;

  IF v_won_lock THEN
    -- Wygrany lock: alokuj wersję przez counter increment
    INSERT INTO public.advisory_version_counters (advisory_type, subject_key, next_version)
    VALUES (p_advisory_type, p_subject_key, 2)  -- start 2 → pierwsza alokacja = 1
    ON CONFLICT (advisory_type, subject_key)
    DO UPDATE SET
      next_version = public.advisory_version_counters.next_version + 1,
      updated_at = now()
    RETURNING next_version - 1 INTO v_allocated_version;

    -- Zapisz zaalokowaną wersję w rezerwacji (z placeholder -1 → final)
    UPDATE public.version_reservations
       SET version = v_allocated_version
     WHERE processing_run_id = p_processing_run_id
       AND advisory_type = p_advisory_type
       AND subject_key = p_subject_key;

    RETURN v_allocated_version;
  ELSE
    -- Przegrany lock: czytaj już zaalokowaną wartość
    -- FOR UPDATE: czeka na winner's transaction commit (row lock)
    -- Retry z backoff na wypadek outside-transaction race (bardzo rzadkie)
    LOOP
      SELECT version INTO v_existing
        FROM public.version_reservations
       WHERE processing_run_id = p_processing_run_id
         AND advisory_type = p_advisory_type
         AND subject_key = p_subject_key
       FOR UPDATE;

      IF v_existing IS NOT NULL AND v_existing > -1 THEN
        RETURN v_existing;
      END IF;

      v_retries := v_retries + 1;
      IF v_retries >= 3 THEN
        RAISE EXCEPTION 'reserve_version_else_branch_timeout (run=%, type=%, subject=%)',
          p_processing_run_id, p_advisory_type, p_subject_key;
      END IF;

      -- max cumulative sleep budget 500ms w otwartej transakcji [v14]
      PERFORM pg_sleep(0.1);
    END LOOP;
  END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_advisory_version(UUID, TEXT, TEXT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.reserve_advisory_version(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.reserve_advisory_version(UUID, TEXT, TEXT) IS
  'Atomowa alokacja version dla processing_advisories. Lock-first pattern: '
  'INSERT ON CONFLICT DO NOTHING jako lock, winner inkrementuje counter, '
  'pozostali SELECT FOR UPDATE. Idempotent przez PK version_reservations. '
  'Lease ownership check jest w warstwie aplikacyjnej (Next.js handler). '
  'Patrz: docs/processing-service-plan.md §8';


-- ═══════════════════════════════════════════════════════════════
-- 5. RLS — wszystkie tabele service_role only
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.processing_job_advisories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisory_version_counters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.version_reservations        ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- processing_job_advisories
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'processing_job_advisories'
      AND policyname = 'service_all_processing_job_advisories'
  ) THEN
    CREATE POLICY "service_all_processing_job_advisories" ON public.processing_job_advisories
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'processing_job_advisories'
      AND policyname = 'admin_read_processing_job_advisories'
  ) THEN
    CREATE POLICY "admin_read_processing_job_advisories" ON public.processing_job_advisories
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;

  -- advisory_version_counters
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'advisory_version_counters'
      AND policyname = 'service_all_advisory_version_counters'
  ) THEN
    CREATE POLICY "service_all_advisory_version_counters" ON public.advisory_version_counters
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- version_reservations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'version_reservations'
      AND policyname = 'service_all_version_reservations'
  ) THEN
    CREATE POLICY "service_all_version_reservations" ON public.version_reservations
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
