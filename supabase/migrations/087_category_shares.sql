-- Migration 087: Category shares + booking-recording share guard triggers
-- ========================================================================
-- Allows a user to share a user_category with another user (direct) or
-- via a link token (recipient_user_id IS NULL → link share).
--
-- Share semantics:
--   * Share = exactly the named category (not subtree descendants).
--   * Recipient sees saves in that category via ufs_read_via_share RLS policy.
--   * Link-share recipients access via API token lookup (service_role), not RLS.
--
-- Triple-safety for booking_recording saves:
--   1. API validation (returns 400 before DB call)
--   2. ufs_booking_not_in_shared trigger (BEFORE INSERT OR UPDATE on user_fragment_saves)
--   3. check_category_shareable trigger (BEFORE INSERT OR UPDATE on category_shares)
-- Triggers guard DB-level even if API has a regression.

CREATE TABLE IF NOT EXISTS public.category_shares (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID        NOT NULL REFERENCES public.user_categories(id) ON DELETE CASCADE,
  owner_user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token       UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  recipient_user_id UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  can_resave        BOOLEAN     NOT NULL DEFAULT false,
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One direct share per (category, recipient)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cshare_recipient
  ON public.category_shares(category_id, recipient_user_id)
  WHERE recipient_user_id IS NOT NULL;

-- Token lookup (active only)
CREATE INDEX IF NOT EXISTS idx_cshare_token
  ON public.category_shares(share_token)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cshare_recipient_lookup
  ON public.category_shares(recipient_user_id)
  WHERE recipient_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cshare_category
  ON public.category_shares(category_id);

ALTER TABLE public.category_shares ENABLE ROW LEVEL SECURITY;

-- Owner manages their shares
CREATE POLICY cshare_owner ON public.category_shares
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Direct recipient can read their active, non-expired shares
CREATE POLICY cshare_recipient_read ON public.category_shares
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

-- ── RLS policy on user_fragment_saves: read via direct share ──────────────
-- (Category_shares now exists; we can add this policy safely.)
-- Note: link-share recipients access via API/service_role, not this policy.
CREATE POLICY ufs_read_via_share ON public.user_fragment_saves
  FOR SELECT TO authenticated
  USING (
    -- Booking-recording saves are never shared
    booking_recording_id IS NULL
    AND category_id IN (
      SELECT cs.category_id
      FROM public.category_shares cs
      WHERE cs.revoked_at IS NULL
        AND (cs.expires_at IS NULL OR cs.expires_at > now())
        AND cs.recipient_user_id = auth.uid()
    )
  );

-- ── Guard: category_shares BEFORE INSERT OR UPDATE ────────────────────────
-- Block sharing a category that contains any booking-recording saves (direct).
CREATE OR REPLACE FUNCTION public.check_category_shareable()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_fragment_saves
    WHERE category_id = NEW.category_id
      AND booking_recording_id IS NOT NULL
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Category contains booking-recording fragments which cannot be shared'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS category_shares_shareable ON public.category_shares;
CREATE TRIGGER category_shares_shareable
  BEFORE INSERT OR UPDATE ON public.category_shares
  FOR EACH ROW EXECUTE FUNCTION public.check_category_shareable();

-- ── Guard: user_fragment_saves BEFORE INSERT OR UPDATE ───────────────────
-- Block placing a booking-recording save into an already-shared category.
-- Checks active, non-expired shares only (same condition as ufs_read_via_share).
CREATE OR REPLACE FUNCTION public.check_save_not_in_shared()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booking_recording_id IS NOT NULL
     AND NEW.category_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.category_shares cs
       WHERE cs.category_id = NEW.category_id
         AND cs.revoked_at IS NULL
         AND (cs.expires_at IS NULL OR cs.expires_at > now())
       LIMIT 1
     )
  THEN
    RAISE EXCEPTION 'Cannot place booking-recording fragment in a shared category'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ufs_booking_not_in_shared ON public.user_fragment_saves;
CREATE TRIGGER ufs_booking_not_in_shared
  BEFORE INSERT OR UPDATE OF category_id, booking_recording_id
  ON public.user_fragment_saves
  FOR EACH ROW EXECUTE FUNCTION public.check_save_not_in_shared();

COMMENT ON TABLE public.category_shares IS
  'Direct and link shares of user_categories. Share = named category only (no subtree). Booking-recording saves blocked from shared categories at DB level (triggers + RLS).';

COMMENT ON COLUMN public.category_shares.recipient_user_id IS
  'NULL = link share (access via API token). NOT NULL = direct share (access via RLS cshare_recipient_read).';
