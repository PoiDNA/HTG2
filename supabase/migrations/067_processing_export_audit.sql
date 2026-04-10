-- ═══════════════════════════════════════════════════════════════
-- 067: processing_export_audit — audit log eksportów do processing service
--
-- Audit trail każdego wywołania eksportu (single, batch, consent-fingerprints,
-- write-back, job status) z HTG2 do processing service worker. Wzorzec
-- skopiowany z session_client_insights_audit (mig 054) i admin_audit_log
-- (mig 037). Używany WYŁĄCZNIE do raportów DPO — NIE jest źródłem
-- autoryzacji (to robi processing_export_subjects z mig 066).
--
-- Wpisy:
--   * type — typ zdarzenia (export_single, export_batch, write_back_advisory,
--     reserve_version, job_create, job_status, fingerprint_check, purge_send)
--   * processing_run_id — link do processing_jobs.processing_run_id (nullable,
--     bo fingerprint_check i purge_send nie mają powiązanego runa)
--   * target_user_id / target_booking_id / target_meeting_id — subject
--     którego dotyczy audit row (nullable w zależności od typu)
--   * caller_service_id — derivowany z HMAC KID (np. 'htg-processing-v1'),
--     pozwala filtrować raporty per service
--   * caller_kid — który KID był używany (v1, v2 podczas rotacji)
--   * passed BOOLEAN — czy request przeszedł consent gate
--   * missing TEXT[] — lista brakujących gate'ów jeśli passed=false
--   * details JSONB — dodatkowe per-typ dane (scopes_count, matched_count,
--     latency_ms, idempotency_hit, error_code, ...)
--   * latency_ms — czas handler'a end-to-end dla cost/perf monitoring
--
-- Retention: handled przez aplikację (background cleanup), nie hard rule.
-- Raporty tygodniowe do DPO przez widok agregujący (budowane w PR4/5).
--
-- Patrz: docs/processing-service-plan.md §3.1 punkt 6, §20.5
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.processing_export_audit (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  type                 TEXT NOT NULL CHECK (type IN (
    'export_single',
    'export_batch',
    'fingerprint_check',
    'write_back_advisory',
    'reserve_version',
    'job_create',
    'job_start',
    'job_status',
    'purge_send'
  )),

  -- Link do processing_jobs.processing_run_id (nullable dla fingerprint_check,
  -- purge_send które nie mają runa)
  processing_run_id    UUID,

  -- Targets — nullable w zależności od typu
  target_user_id       UUID,  -- nie FK: auth.users soft delete może zostawić audit
  target_booking_id    UUID,
  target_meeting_id    UUID,

  -- Caller identity (HMAC-verified)
  caller_service_id    TEXT NOT NULL,
  caller_kid           TEXT NOT NULL,

  -- Result
  passed               BOOLEAN,  -- czy przeszedł consent gate (nullable dla typów bez gate)
  missing              TEXT[],   -- brakujące gate'y dla passed=false

  error_code           TEXT,     -- enum code (nie raw model output)
  latency_ms           INT,
  details              JSONB DEFAULT '{}'::jsonb,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.processing_export_audit IS
  'Audit trail eksportów do processing service. Używane WYŁĄCZNIE do raportów '
  'DPO — NIE jest źródłem autoryzacji (to processing_export_subjects z mig 066). '
  'Wzorzec: session_client_insights_audit (mig 054) + admin_audit_log (mig 037). '
  'Patrz: docs/processing-service-plan.md §3.1 punkt 6, §20.5';


-- ── Indexes dla raportów DPO ──────────────────────────────────

-- Pełen scan typu + okres (tygodniowy raport)
CREATE INDEX IF NOT EXISTS processing_export_audit_type_created_idx
  ON public.processing_export_audit (type, created_at DESC);

-- Per-service raporty
CREATE INDEX IF NOT EXISTS processing_export_audit_service_created_idx
  ON public.processing_export_audit (caller_service_id, created_at DESC);

-- Per-user lookup (art. 15 access request — user pyta "co was wiedzieliście")
CREATE INDEX IF NOT EXISTS processing_export_audit_target_user_idx
  ON public.processing_export_audit (target_user_id)
  WHERE target_user_id IS NOT NULL;

-- Failed requests alert — wysoki rate może sygnalizować problem
CREATE INDEX IF NOT EXISTS processing_export_audit_failed_idx
  ON public.processing_export_audit (created_at DESC)
  WHERE passed = false OR error_code IS NOT NULL;

-- Reconcile support — lookup po processing_run_id
CREATE INDEX IF NOT EXISTS processing_export_audit_run_idx
  ON public.processing_export_audit (processing_run_id)
  WHERE processing_run_id IS NOT NULL;


-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE public.processing_export_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'processing_export_audit'
      AND policyname = 'service_all_processing_export_audit'
  ) THEN
    CREATE POLICY "service_all_processing_export_audit" ON public.processing_export_audit
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'processing_export_audit'
      AND policyname = 'admin_read_processing_export_audit'
  ) THEN
    CREATE POLICY "admin_read_processing_export_audit" ON public.processing_export_audit
      FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
