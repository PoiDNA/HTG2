-- ═══════════════════════════════════════════════════════════════
-- 054 API Rate Limits
-- Generyczny log rate-limit dla endpointów i server actions POZA community.
-- community_rate_log (migracja 030) obsługuje osobny domain.
-- Patrz: lib/rate-limit/check.ts
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

CREATE POLICY "service_all_api_rate_limits" ON public.api_rate_limits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
