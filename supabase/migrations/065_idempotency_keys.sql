-- ═══════════════════════════════════════════════════════════════
-- 065: idempotency_keys — DB-enforced idempotent endpoints
--
-- Tabela do idempotent write-back processing_advisories i terminalne
-- status callbacks (done/failed). DB-enforced atomowość przez PRIMARY KEY
-- na `key` + INSERT ON CONFLICT DO NOTHING w jednej transakcji z biznesowym
-- write. Eliminuje race w check-then-insert.
--
-- Format Idempotency-Key (I3 [v13]):
--   UC2 write-back: {processing_run_id}:mapa_uwarunkowan:{version}
--   UC1 write-back: {processing_run_id}:group_enrichment:{proposal_id}:{group_index}:{version}
--   Status callback done/failed: {job_id}:{terminal_status}
--
-- Reserve-version NIE używa Idempotency-Key — ma natywną idempotencję przez
-- PK version_reservations.
--
-- Zachowanie:
-- - Powtórny POST z tym samym kluczem → HTG2 zwraca cached response_body
--   z 0 rows affected (nie tworzy duplikatu biznesowego rekordu)
-- - Klucz nigdy nie jest reużywany po TTL — nowy run = nowy key
-- - TTL 7 dni zarządzany background cleanup job
-- - Kolizja (ten sam klucz z różnym response body) NIE powinna się zdarzyć;
--   wykrywamy przez compare response_body hash + alert
--
-- Patrz: docs/processing-service-plan.md §2.1, §7
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key             TEXT PRIMARY KEY,
  response_status INT NOT NULL,
  response_body   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index dla cleanup job (usuwa klucze starsze niż 7 dni)
CREATE INDEX IF NOT EXISTS idempotency_keys_cleanup_idx
  ON public.idempotency_keys (created_at);

COMMENT ON TABLE public.idempotency_keys IS
  'DB-enforced idempotent endpoints dla processing service write-back. '
  'PRIMARY KEY (key) + INSERT ON CONFLICT DO NOTHING zapewnia atomowość z '
  'biznesowym write w jednej transakcji. TTL 7 dni, cleanup background job. '
  'Patrz: docs/processing-service-plan.md §2.1, §7';


-- ── RLS: service_role only (wszystkie writes przez API handler) ──

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'idempotency_keys'
      AND policyname = 'service_all_idempotency_keys'
  ) THEN
    CREATE POLICY "service_all_idempotency_keys" ON public.idempotency_keys
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;


-- ── Background cleanup function (wywołana przez cron, nie trigger) ──
-- Używane przez cron worker (np. Vercel Cron job) co godzinę/dzień.
-- Usuwa klucze starsze niż 7 dni. TTL jest runtime concept, nie schematowy.

CREATE OR REPLACE FUNCTION public.cleanup_idempotency_keys()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.idempotency_keys
   WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_idempotency_keys() FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_idempotency_keys() TO service_role;

COMMENT ON FUNCTION public.cleanup_idempotency_keys() IS
  'Background cleanup idempotency_keys z TTL 7 dni. Wywoływane przez cron worker. '
  'Zwraca liczbę usuniętych wierszy. Patrz: docs/processing-service-plan.md §2.1';
