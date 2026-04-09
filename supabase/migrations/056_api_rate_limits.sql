-- ═══════════════════════════════════════════════════════════════
-- 056 API Rate Limits
-- Generyczny log rate-limit dla endpointów i server actions POZA community.
-- community_rate_log (migracja 030) obsługuje osobny domain.
-- Patrz: lib/rate-limit/check.ts
-- ═══════════════════════════════════════════════════════════════
-- IDEMPOTENCY NOTE: ta migracja była już raz zaaplikowana ręcznie w Dashboard
-- pod numerem 054 w ramach zamkniętego PR #272 (superseded by #280). Wszystkie
-- obiekty są opakowane w IF NOT EXISTS / DO $$ block żeby replay był bezpieczny
-- niezależnie od stanu bazy.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index dla lookup (user_id, action_type, since) — identyczny wzorzec jak 030.
CREATE INDEX IF NOT EXISTS idx_arl_user_action_created
  ON public.api_rate_limits(user_id, action_type, created_at DESC);

-- RLS: tylko service_role czyta/pisze. Nic user-facing.
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY nie ma wariantu IF NOT EXISTS w Postgres — opakowujemy
-- w DO block który sprawdza pg_policies. Bez tego replay wali błędem 42710.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'api_rate_limits'
      AND policyname = 'service_all_api_rate_limits'
  ) THEN
    CREATE POLICY "service_all_api_rate_limits" ON public.api_rate_limits
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
