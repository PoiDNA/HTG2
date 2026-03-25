-- HTG Schema — Phase 1 (MVP VOD)
-- All HTG tables in dedicated schema

CREATE SCHEMA IF NOT EXISTS htg;

-- ============================================================
-- User profiles (extends auth.users)
-- ============================================================
CREATE TABLE htg.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_own_select ON htg.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_own_update ON htg.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY profiles_own_insert ON htg.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION htg.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO htg.profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION htg.handle_new_user();


-- ============================================================
-- GDPR consent records (art. 9 sensitive data)
-- ============================================================
CREATE TABLE htg.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL, -- 'sensitive_data', 'marketing', 'terms', 'digital_content'
  granted BOOLEAN NOT NULL DEFAULT true,
  ip_address INET,
  user_agent TEXT,
  consent_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_own_select ON htg.consent_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY consent_own_insert ON htg.consent_records FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- Products (VOD sessions, monthly sets, subscriptions)
-- ============================================================
CREATE TABLE htg.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('vod_single', 'vod_set', 'subscription')),
  stripe_product_id TEXT UNIQUE,
  cover_image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_public_read ON htg.products FOR SELECT USING (is_active = true);


-- ============================================================
-- Prices (synced with Stripe)
-- ============================================================
CREATE TABLE htg.prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES htg.products(id) ON DELETE CASCADE,
  stripe_price_id TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL, -- in grosz/cents
  currency TEXT NOT NULL DEFAULT 'pln',
  interval TEXT CHECK (interval IN ('month', 'year', NULL)),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY prices_public_read ON htg.prices FOR SELECT USING (is_active = true);


-- ============================================================
-- Session templates (individual VOD sessions)
-- ============================================================
CREATE TABLE htg.session_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  duration_minutes INTEGER,
  bunny_video_id TEXT,
  bunny_library_id TEXT,
  thumbnail_url TEXT,
  is_published BOOLEAN DEFAULT false,
  is_drm BOOLEAN DEFAULT false, -- ready for Phase 4
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.session_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_public_read ON htg.session_templates FOR SELECT USING (is_published = true);


-- ============================================================
-- Monthly sets (grouping sessions into packages)
-- ============================================================
CREATE TABLE htg.monthly_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES htg.products(id),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  month_label TEXT, -- e.g., '2026-03'
  cover_image_url TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.monthly_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY sets_public_read ON htg.monthly_sets FOR SELECT USING (is_published = true);


-- ============================================================
-- Junction: which sessions belong to which sets
-- ============================================================
CREATE TABLE htg.set_sessions (
  set_id UUID REFERENCES htg.monthly_sets(id) ON DELETE CASCADE,
  session_id UUID REFERENCES htg.session_templates(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (set_id, session_id)
);

ALTER TABLE htg.set_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY set_sessions_public_read ON htg.set_sessions FOR SELECT USING (true);


-- ============================================================
-- Orders
-- ============================================================
CREATE TABLE htg.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  total_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'pln',
  invoice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_own_select ON htg.orders FOR SELECT USING (auth.uid() = user_id);


-- ============================================================
-- Order items
-- ============================================================
CREATE TABLE htg.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES htg.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES htg.products(id),
  price_id UUID REFERENCES htg.prices(id),
  quantity INTEGER DEFAULT 1
);

ALTER TABLE htg.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_own ON htg.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM htg.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));


-- ============================================================
-- Entitlements (what user has access to)
-- ============================================================
CREATE TABLE htg.entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES htg.products(id),
  session_id UUID REFERENCES htg.session_templates(id),
  type TEXT NOT NULL CHECK (type IN ('session', 'monthly', 'yearly')),
  scope_month TEXT, -- e.g., '2026-01' for monthly entitlement
  stripe_subscription_id TEXT,
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entitlements_user ON htg.entitlements(user_id);
CREATE INDEX idx_entitlements_active ON htg.entitlements(user_id, is_active, valid_until);

ALTER TABLE htg.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY entitlements_own ON htg.entitlements FOR SELECT USING (auth.uid() = user_id);


-- ============================================================
-- YouTube public videos
-- ============================================================
CREATE TABLE htg.youtube_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.youtube_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY youtube_public_read ON htg.youtube_videos FOR SELECT USING (is_visible = true);


-- ============================================================
-- Active streams (concurrent playback limiter)
-- ============================================================
CREATE TABLE htg.active_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  session_id UUID REFERENCES htg.session_templates(id),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX idx_active_streams_user ON htg.active_streams(user_id, last_heartbeat);

ALTER TABLE htg.active_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY streams_own_all ON htg.active_streams FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- Audit logs
-- ============================================================
CREATE TABLE htg.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit logs: admin only (no public RLS policy)
ALTER TABLE htg.audit_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- Helper functions
-- ============================================================

-- Cleanup stale streams (heartbeat > 60s old)
CREATE OR REPLACE FUNCTION htg.cleanup_stale_streams()
RETURNS void AS $$
BEGIN
  DELETE FROM htg.active_streams
  WHERE last_heartbeat < now() - interval '60 seconds';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if stream allowed for user/device
CREATE OR REPLACE FUNCTION htg.check_stream_allowed(p_user_id UUID, p_device_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  other_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO other_count
  FROM htg.active_streams
  WHERE user_id = p_user_id
    AND device_id != p_device_id
    AND last_heartbeat > now() - interval '60 seconds';

  RETURN other_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- Payment reconciliation (cronjob helper)
-- ============================================================
CREATE TABLE htg.payment_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id TEXT NOT NULL,
  stripe_status TEXT,
  entitlement_id UUID REFERENCES htg.entitlements(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE htg.payment_reconciliation ENABLE ROW LEVEL SECURITY;
-- Admin only, no public policies
