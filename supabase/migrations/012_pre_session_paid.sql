-- ─── 012: Paid pre-session meetings ──────────────────────────────────────────
-- Adds paid purchase path (100 PLN) for pre-session meetings per assistant.
-- Each assistant can have their own Stripe price ID configured in settings.

-- 1. Extend pre_session_settings with Stripe pricing
ALTER TABLE public.pre_session_settings
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,      -- Stripe price ID (price_...)
  ADD COLUMN IF NOT EXISTS price_pln        INTEGER;  -- price in grosz (e.g. 10000 = 100 PLN)

-- 2. Extend pre_session_eligibility with payment tracking
ALTER TABLE public.pre_session_eligibility
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'free'
    CHECK (payment_type IN ('free', 'paid')),
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- 3. Fix the UNIQUE constraint to allow both free and paid rows per (user, staff)
--    Old: UNIQUE (user_id, staff_member_id, source_booking_id)  ← blocks paid+free coexistence
--    New: separate partial indexes — one for free rows, one for paid rows
ALTER TABLE public.pre_session_eligibility
  DROP CONSTRAINT IF EXISTS pre_session_eligibility_user_id_staff_member_id_source_booking__key;

-- Partial unique: one free grant per (user, staff, source_booking_id)
CREATE UNIQUE INDEX IF NOT EXISTS pre_eligibility_free_unique
  ON public.pre_session_eligibility (user_id, staff_member_id, COALESCE(source_booking_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE payment_type = 'free';

-- Partial unique: one paid grant per order (idempotent webhook retries)
CREATE UNIQUE INDEX IF NOT EXISTS pre_eligibility_paid_order_unique
  ON public.pre_session_eligibility (order_id)
  WHERE payment_type = 'paid' AND order_id IS NOT NULL;

-- 4. Comments
COMMENT ON COLUMN public.pre_session_settings.stripe_price_id IS
  'Stripe price ID for paid pre-session purchases. NULL = no paid option available.';
COMMENT ON COLUMN public.pre_session_settings.price_pln IS
  'Display price in grosz (e.g. 10000 = 100 PLN). Must match Stripe price.';
COMMENT ON COLUMN public.pre_session_eligibility.payment_type IS
  'free = granted manually by assistant; paid = purchased via Stripe';
COMMENT ON COLUMN public.pre_session_eligibility.order_id IS
  'Reference to orders.id for paid eligibilities. NULL for free grants.';
