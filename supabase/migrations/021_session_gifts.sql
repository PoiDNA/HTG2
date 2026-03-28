-- Migration 021: Session Gifts — kupuję sesję dla kogoś innego
-- ==============================================================
-- Iwona buys a session for her son. The entitlement stays on Iwona's account
-- until the son creates an account and claims it (transfers to his account).
-- Alternatively, Iwona can manually transfer it at any time.

CREATE TABLE IF NOT EXISTS public.session_gifts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id     UUID        NOT NULL REFERENCES public.entitlements(id) ON DELETE CASCADE,
  purchased_by       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email    TEXT        NOT NULL,
  recipient_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  claim_token        TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  message            TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'claimed', 'revoked')),
  claimed_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id)  -- one gift record per entitlement
);

CREATE INDEX IF NOT EXISTS idx_session_gifts_purchased_by    ON public.session_gifts(purchased_by);
CREATE INDEX IF NOT EXISTS idx_session_gifts_recipient_email ON public.session_gifts(recipient_email);
CREATE INDEX IF NOT EXISTS idx_session_gifts_recipient_user  ON public.session_gifts(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_session_gifts_token           ON public.session_gifts(claim_token);

ALTER TABLE public.session_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_gifts" ON public.session_gifts;
CREATE POLICY "service_all_gifts" ON public.session_gifts
  FOR ALL USING (true) WITH CHECK (true);
