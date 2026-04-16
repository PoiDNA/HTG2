-- Migration 091: Fragment feature entitlement
-- ============================================
-- Fragments (user saves, playback, radio, sharing) are an optional paid
-- feature orthogonal to session-content access. A user needs BOTH:
--   1. fragment_access entitlement   — can use the Fragments feature at all
--   2. session / recording access    — can play back the underlying media
--
-- Admin always bypasses both gates.
--
-- Model: extend existing `entitlements` table with:
--   type = 'feature'  (new enum value)
--   feature_key = 'fragments'  (new column, non-null when type='feature')
--
-- Stripe webhook creates entitlements(type='feature', feature_key='fragments',
-- product_id=<fragments_product_id>, valid_until=<period_end>) on subscription
-- creation / renewal. The webhook logic uses the existing entitlement upsert
-- pattern — no structural change needed there.
--
-- Admin manual grant: POST /api/admin/entitlements with
--   { user_id, type:'feature', feature_key:'fragments', valid_until }

-- 1. Extend type CHECK to include 'feature'
ALTER TABLE public.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_type_check;

ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_type_check
    CHECK (type IN ('session', 'monthly', 'yearly', 'feature'));

-- 2. Add feature_key column (TEXT, nullable — only used when type='feature')
ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS feature_key TEXT;

-- 3. Enforce: type='feature' requires feature_key NOT NULL (and vice versa)
ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_feature_key_consistency CHECK (
    (type = 'feature' AND feature_key IS NOT NULL)
    OR (type <> 'feature' AND feature_key IS NULL)
  );

-- 4. Index for fast fragment access lookup
CREATE INDEX IF NOT EXISTS idx_entitlements_feature
  ON public.entitlements(user_id, feature_key, is_active, valid_until)
  WHERE type = 'feature';

COMMENT ON COLUMN public.entitlements.feature_key IS
  'Non-null when type=''feature''. Currently: ''fragments''. Future: other optional paid features.';

COMMENT ON CONSTRAINT entitlements_feature_key_consistency ON public.entitlements IS
  'Ensures feature_key IS NOT NULL exactly when type=''feature''.';
