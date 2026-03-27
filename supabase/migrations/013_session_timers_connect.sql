-- ─── 013: Session phase timers + Stripe Connect per assistant ────────────────

-- 1. Phase timestamps + duration columns in live_sessions
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS sesja_started_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS podsumowanie_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wstep_duration_seconds       INTEGER,
  ADD COLUMN IF NOT EXISTS sesja_duration_seconds       INTEGER,
  ADD COLUMN IF NOT EXISTS podsumowanie_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS total_duration_seconds       INTEGER;

-- Note: wstep_started_at = started_at (already exists, set when phase→wstep)

-- 2. Stripe Connect account ID per staff member
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

COMMENT ON COLUMN public.live_sessions.sesja_started_at IS
  'Timestamp when phase changed to sesja (Faza 2). Used for duration stats.';
COMMENT ON COLUMN public.live_sessions.podsumowanie_started_at IS
  'Timestamp when phase changed to podsumowanie (Faza 3). Used for duration stats.';
COMMENT ON COLUMN public.live_sessions.wstep_duration_seconds IS
  'Duration of Faza 1 (wstep) in seconds. Set when phase leaves wstep.';
COMMENT ON COLUMN public.live_sessions.sesja_duration_seconds IS
  'Duration of Faza 2 (sesja) in seconds. Set when phase leaves sesja.';
COMMENT ON COLUMN public.live_sessions.podsumowanie_duration_seconds IS
  'Duration of Faza 3 (podsumowanie) in seconds. Set when phase leaves podsumowanie.';
COMMENT ON COLUMN public.live_sessions.total_duration_seconds IS
  'Total session duration from started_at to ended_at in seconds.';
COMMENT ON COLUMN public.staff_members.stripe_connect_account_id IS
  'Stripe Connect account ID for assistant payouts (acct_...). NULL = no Connect.';
