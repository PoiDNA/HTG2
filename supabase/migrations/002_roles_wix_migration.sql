-- Migration 002: Roles, WIX migration fields, yearly subscription logic
-- ====================================================================

-- ============================================================
-- 1. Add role system to profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'moderator')),
  ADD COLUMN IF NOT EXISTS wix_member_id TEXT,
  ADD COLUMN IF NOT EXISTS wix_migrated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_wix ON public.profiles(wix_member_id);

-- Admin RLS: admins can read all profiles
CREATE POLICY profiles_admin_select ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin RLS: admins can update any profile
CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ============================================================
-- 2. Add WIX migration tracking to orders
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS wix_order_id TEXT,
  ADD COLUMN IF NOT EXISTS wix_plan_name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'stripe'
    CHECK (source IN ('stripe', 'wix', 'manual', 'migration'));


-- ============================================================
-- 3. Add monthly_set_id to entitlements (link to specific set)
-- ============================================================
ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS monthly_set_id UUID REFERENCES public.monthly_sets(id),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'stripe'
    CHECK (source IN ('stripe', 'wix', 'manual', 'migration'));


-- ============================================================
-- 4. Yearly subscription mechanism
-- When user buys yearly plan (999 PLN), they get 12 consecutive
-- monthly entitlements starting from purchase month.
-- ============================================================

-- Function: given a start date, create 12 monthly entitlements
CREATE OR REPLACE FUNCTION public.grant_yearly_subscription(
  p_user_id UUID,
  p_start_date DATE,
  p_order_id UUID DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'stripe'
)
RETURNS SETOF UUID AS $$
DECLARE
  v_month DATE;
  v_month_label TEXT;
  v_set_id UUID;
  v_entitlement_id UUID;
  v_product_id UUID;
BEGIN
  -- Get the yearly product
  SELECT id INTO v_product_id FROM public.products WHERE slug = 'pakiet-roczny' LIMIT 1;

  FOR i IN 0..11 LOOP
    v_month := p_start_date + (i || ' months')::interval;
    v_month_label := to_char(v_month, 'YYYY-MM');

    -- Find the monthly_set for this month
    SELECT id INTO v_set_id
    FROM public.monthly_sets
    WHERE month_label = v_month_label
    LIMIT 1;

    -- Create entitlement for this month
    INSERT INTO public.entitlements (
      user_id, product_id, type, scope_month, monthly_set_id,
      valid_from, valid_until, is_active,
      stripe_subscription_id, source
    ) VALUES (
      p_user_id,
      v_product_id,
      'yearly',
      v_month_label,
      v_set_id,
      v_month,
      v_month + interval '24 months', -- 24 month access window
      true,
      p_stripe_subscription_id,
      p_source
    )
    RETURNING id INTO v_entitlement_id;

    RETURN NEXT v_entitlement_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 5. Function: grant monthly entitlement (single month purchase)
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_monthly_entitlement(
  p_user_id UUID,
  p_month_label TEXT, -- e.g., '2025-08'
  p_order_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'stripe'
)
RETURNS UUID AS $$
DECLARE
  v_set_id UUID;
  v_product_id UUID;
  v_entitlement_id UUID;
  v_valid_from DATE;
BEGIN
  -- Get the monthly product
  SELECT id INTO v_product_id FROM public.products WHERE slug = 'pakiet-miesieczny' LIMIT 1;

  -- Find set
  SELECT id INTO v_set_id
  FROM public.monthly_sets
  WHERE month_label = p_month_label
  LIMIT 1;

  v_valid_from := (p_month_label || '-01')::date;

  INSERT INTO public.entitlements (
    user_id, product_id, type, scope_month, monthly_set_id,
    valid_from, valid_until, is_active, source
  ) VALUES (
    p_user_id,
    v_product_id,
    'monthly',
    p_month_label,
    v_set_id,
    v_valid_from,
    v_valid_from + interval '24 months',
    true,
    p_source
  )
  RETURNING id INTO v_entitlement_id;

  RETURN v_entitlement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 6. Check access function (used by video player API)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_access(
  p_user_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_monthly_set_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check yearly entitlement (access to all sets in range)
  IF EXISTS (
    SELECT 1 FROM public.entitlements
    WHERE user_id = p_user_id
      AND is_active = true
      AND valid_until > now()
      AND type = 'yearly'
      AND (p_monthly_set_id IS NULL OR monthly_set_id = p_monthly_set_id)
  ) THEN
    RETURN true;
  END IF;

  -- Check monthly entitlement
  IF p_monthly_set_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.entitlements
    WHERE user_id = p_user_id
      AND is_active = true
      AND valid_until > now()
      AND type = 'monthly'
      AND monthly_set_id = p_monthly_set_id
  ) THEN
    RETURN true;
  END IF;

  -- Check single session entitlement
  IF p_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.entitlements
    WHERE user_id = p_user_id
      AND is_active = true
      AND valid_until > now()
      AND type = 'session'
      AND session_id = p_session_id
  ) THEN
    RETURN true;
  END IF;

  -- Admin always has access
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'admin'
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 7. Helper: map Polish month name to YYYY-MM
-- ============================================================
CREATE OR REPLACE FUNCTION public.polish_month_to_label(p_name TEXT)
RETURNS TEXT AS $$
DECLARE
  v_parts TEXT[];
  v_month TEXT;
  v_year TEXT;
  v_mm TEXT;
BEGIN
  -- Expected input: "Sesje Sierpień 2025"
  v_parts := regexp_matches(p_name, 'Sesje\s+(\w+)\s+(\d{4})');
  IF v_parts IS NULL THEN RETURN NULL; END IF;

  v_month := v_parts[1];
  v_year := v_parts[2];

  v_mm := CASE v_month
    WHEN 'Styczeń' THEN '01'  WHEN 'Luty' THEN '02'
    WHEN 'Marzec' THEN '03'   WHEN 'Kwiecień' THEN '04'
    WHEN 'Maj' THEN '05'      WHEN 'Czerwiec' THEN '06'
    WHEN 'Lipiec' THEN '07'   WHEN 'Sierpień' THEN '08'
    WHEN 'Wrzesień' THEN '09' WHEN 'Październik' THEN '10'
    WHEN 'Listopad' THEN '11' WHEN 'Grudzień' THEN '12'
    ELSE NULL
  END;

  IF v_mm IS NULL THEN RETURN NULL; END IF;
  RETURN v_year || '-' || v_mm;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
