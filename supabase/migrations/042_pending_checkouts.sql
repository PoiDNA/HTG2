-- 042: Pending checkouts — cart state for Stripe webhook processing
-- Replaces Stripe metadata (500 char limit) for bulk session/month purchases
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pending_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'object'),
  -- Canonical shape: { sessions: [session_id, ...], months: [{ monthly_set_id, month_label }, ...] }
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('sessions_only', 'months_only', 'mixed')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  stripe_checkout_session_id TEXT,
  total_amount INTEGER,       -- snapshot in grosz
  currency TEXT DEFAULT 'pln',
  created_at TIMESTAMPTZ DEFAULT now(),
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_checkouts_status
  ON public.pending_checkouts(status)
  WHERE status IN ('pending', 'failed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_checkouts_stripe_session
  ON public.pending_checkouts(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Service role only — no client access
ALTER TABLE public.pending_checkouts ENABLE ROW LEVEL SECURITY;
