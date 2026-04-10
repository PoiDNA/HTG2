-- ═══════════════════════════════════════════════════════════════
-- 068: processing_nonce_store — HMAC anti-replay store
--
-- Anti-replay dla HMAC-signed requestów do/od processing service
-- worker. Plan htg-processing (§2.1) oryginalnie zakładał Upstash Redis
-- jako shared nonce store. HTG2 NIE używa Upstash — rate limiting
-- i inne operacyjne storage są w Supabase (wzorzec api_rate_limits
-- z mig 056, community_rate_log z mig 030).
--
-- Decyzja architektoniczna (odejście od planu):
-- ZAMIAST wprowadzać nową zależność Upstash, używamy dedykowanej tabeli
-- Supabase. Motywacja:
--   1. Mniej subprocessorów w PRE-2 DPA list
--   2. Spójne z istniejącym wzorcem HTG2 (api_rate_limits)
--   3. Brak dodatkowej infrastruktury do zarządzania
--   4. Latency Supabase (< 50ms EU) znacznie < TTL anti-replay (5 min)
--   5. Skalowalne dla przewidywanej skali HTG (dziesiątki req/s max)
--   6. Eliminuje blast radius współdzielonego Upstash opisany w §20.3
--
-- Wzorzec: INSERT ON CONFLICT DO NOTHING jako atomic replay check —
-- jeśli nonce już istnieje w tabeli, powtórzenie jest wykrywane atomowo
-- przez PRIMARY KEY violation. Cleanup background job usuwa wpisy
-- starsze niż TTL (10 min — z marginesem vs 5 min podpisu TTL).
--
-- Keyspace rozdzielony per "direction" przez `kid` prefix:
--   worker → HTG2: kid zaczyna od 'w2h-*'
--   HTG2 → worker: kid zaczyna od 'h2w-*' (używane przez HTG2 walidacja
--     callback inbound — technicznie nie stosowalne po stronie HTG2 bo
--     HTG2 wysyła, nie odbiera od HTG2 → worker, ale zostawiamy spójny
--     kolumnę dla audytu)
--
-- Tylko nonce z inbound requests trafia do tego store. Outbound nonce
-- (HTG2 → worker purge) jest walidowane po stronie workera w osobnym
-- store w htg-processing repo.
--
-- Patrz: docs/processing-service-plan.md §2.1 (decyzja nonce store
-- Supabase zamiast Upstash zapisana jako odchylenie od planu)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.processing_nonce_store (
  nonce       TEXT PRIMARY KEY,
  kid         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index dla cleanup background job
CREATE INDEX IF NOT EXISTS processing_nonce_store_cleanup_idx
  ON public.processing_nonce_store (created_at);

COMMENT ON TABLE public.processing_nonce_store IS
  'Anti-replay nonce store dla HMAC-signed requestów od worker do HTG2. '
  'PRIMARY KEY (nonce) + INSERT ON CONFLICT DO NOTHING atomic replay check. '
  'TTL 10 min via cleanup_processing_nonces() RPC (wywoływane przez cron). '
  'Odchylenie od planu: używa Supabase zamiast Upstash — eliminuje subprocessor '
  'i blast radius współdzielonego Redis. '
  'Patrz: docs/processing-service-plan.md §2.1';


-- ── RLS: service_role only ─────────────────────────────────────

ALTER TABLE public.processing_nonce_store ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'processing_nonce_store'
      AND policyname = 'service_all_processing_nonce_store'
  ) THEN
    CREATE POLICY "service_all_processing_nonce_store" ON public.processing_nonce_store
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;


-- ── Cleanup RPC (wywoływane przez cron, nie trigger) ──────────
-- TTL 10 min — z marginesem nad 5 min TTL podpisu. Replayed nonce
-- po 10 min jest uznawany za nowy — atakujący musi podrobić świeży
-- timestamp, ale timestamp check już go odrzuca jako starszy niż 5 min.

CREATE OR REPLACE FUNCTION public.cleanup_processing_nonces()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.processing_nonce_store
   WHERE created_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_processing_nonces() FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_processing_nonces() TO service_role;

COMMENT ON FUNCTION public.cleanup_processing_nonces() IS
  'Background cleanup processing_nonce_store z TTL 10 min. Wywoływane przez '
  'cron worker (Vercel Cron). Zwraca liczbę usuniętych wierszy. '
  'Patrz: docs/processing-service-plan.md §2.1';
