-- ============================================================
-- HTG Communication Hub — multi-channel messaging system
-- Email (now) + SMS (future-ready)
-- ============================================================

-- Mailboxes (kontakt@, sesje@, natalia@, etc.)
CREATE TABLE IF NOT EXISTS public.mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mailbox members (relational, not UUID[])
CREATE TABLE IF NOT EXISTS public.mailbox_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mailbox_id, user_id)
);

-- Conversations (channel-agnostic threads)
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID REFERENCES public.mailboxes(id),
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'sms', 'internal')),
  subject TEXT,
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_address TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_link_verified BOOLEAN DEFAULT false,
  user_link_method TEXT
    CHECK (user_link_method IN ('auto_spf', 'manual', 'magic_link')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'closed', 'spam')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ai_category TEXT,
  ai_sentiment TEXT,
  ai_summary TEXT,
  ai_suggested_reply TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_from ON conversations(from_address);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_mailbox ON conversations(mailbox_id);

-- Messages (channel-agnostic, with queue support)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email',
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  -- Provider
  provider_metadata JSONB DEFAULT '{}',
  provider_message_id TEXT,
  -- SMTP threading
  smtp_message_id TEXT,
  smtp_in_reply_to TEXT,
  smtp_references TEXT[] DEFAULT '{}',
  -- Participants
  cc TEXT[] DEFAULT '{}',
  bcc TEXT[] DEFAULT '{}',
  -- Admin
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id UUID,
  -- Attachments
  has_attachments BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]',
  -- Queue
  processing_status TEXT DEFAULT 'done'
    CHECK (processing_status IN ('pending', 'processing', 'done', 'failed', 'spam')),
  locked_until TIMESTAMPTZ,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_dedup ON messages(channel, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_smtp_id ON messages(smtp_message_id)
  WHERE smtp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_smtp_reply ON messages(smtp_in_reply_to)
  WHERE smtp_in_reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_processing ON messages(processing_status)
  WHERE processing_status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_msg_spam_check ON messages(from_address, created_at DESC);

-- Message templates (multi-channel)
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'sms', 'all')),
  category TEXT,
  subject TEXT,
  body_html TEXT,
  body_text TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  usage_count INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Autoresponders (multi-channel, with business conditions)
CREATE TABLE IF NOT EXISTS public.autoresponders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  trigger_keywords TEXT[] DEFAULT '{}',
  trigger_category TEXT,
  trigger_conditions JSONB DEFAULT '{}',
  template_id UUID REFERENCES public.message_templates(id),
  delay_minutes INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  max_per_address_24h INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rate limiter + magic link cooldown
CREATE TABLE IF NOT EXISTS public.auto_reply_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address TEXT NOT NULL,
  reply_type TEXT DEFAULT 'autoresponder'
    CHECK (reply_type IN ('autoresponder', 'magic_link')),
  autoresponder_id UUID REFERENCES public.autoresponders(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_reply ON auto_reply_log(to_address, reply_type, sent_at DESC);

-- Seed default mailboxes
INSERT INTO public.mailboxes (address, name, channel, is_default)
VALUES
  ('kontakt@htgcyou.com', 'Kontakt', 'email', true),
  ('sesje@htgcyou.com', 'Sesje', 'email', false)
ON CONFLICT (address) DO NOTHING;

-- ============================================================
-- RPC: Claim pending messages (FOR UPDATE SKIP LOCKED + zombie reset)
-- ============================================================
CREATE OR REPLACE FUNCTION claim_pending_messages(p_limit INT DEFAULT 10)
RETURNS SETOF public.messages
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE public.messages SET
    processing_status = 'processing',
    locked_until = now() + interval '5 minutes'
  WHERE id IN (
    SELECT id FROM public.messages
    WHERE processing_status = 'pending'
       OR (processing_status = 'processing' AND locked_until < now())
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ============================================================
-- RPC: Customer Card (1 query, 6-month window, capped results)
-- ============================================================
CREATE OR REPLACE FUNCTION get_customer_card(
  p_address TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID;
  v_result JSONB;
BEGIN
  -- Resolve user
  IF p_user_id IS NOT NULL THEN
    v_uid := p_user_id;
  ELSE
    SELECT id INTO v_uid FROM public.profiles WHERE email = lower(p_address) LIMIT 1;
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('userId', null, 'email', p_address, 'isGuest', true);
  END IF;

  SELECT jsonb_build_object(
    'userId', p.id,
    'email', p.email,
    'displayName', p.display_name,
    'role', p.role,
    'createdAt', p.created_at,
    'isGuest', false,
    -- Orders (6 month window, max 10)
    'recentOrders', COALESCE((
      SELECT jsonb_agg(row_to_json(sub) ORDER BY sub.created_at DESC)
      FROM (
        SELECT ord.id, ord.status, ord.total_amount AS amount, ord.created_at
        FROM public.orders ord
        WHERE ord.user_id = v_uid
          AND ord.created_at > now() - interval '6 months'
        ORDER BY ord.created_at DESC
        LIMIT 10
      ) sub
    ), '[]'::jsonb),
    -- Active entitlements
    'activeEntitlements', COALESCE((
      SELECT jsonb_agg(row_to_json(sub))
      FROM (
        SELECT e.type, e.valid_until, COALESCE(pr.name, e.type) AS product_name
        FROM public.entitlements e
        LEFT JOIN public.products pr ON pr.id = e.product_id
        WHERE e.user_id = v_uid AND e.is_active = true AND e.valid_until > now()
      ) sub
    ), '[]'::jsonb),
    -- Upcoming bookings (max 5)
    'upcomingBookings', COALESCE((
      SELECT jsonb_agg(row_to_json(sub) ORDER BY sub.slot_date)
      FROM (
        SELECT bs.slot_date, bs.start_time, bs.session_type, bk.status
        FROM public.bookings bk
        JOIN public.booking_slots bs ON bs.id = bk.slot_id
        WHERE bk.user_id = v_uid AND bs.slot_date >= CURRENT_DATE
        ORDER BY bs.slot_date
        LIMIT 5
      ) sub
    ), '[]'::jsonb),
    -- Stats
    'totalBookings', (SELECT count(*) FROM public.bookings WHERE user_id = v_uid),
    'hasActiveSubscription', EXISTS(
      SELECT 1 FROM public.entitlements
      WHERE user_id = v_uid AND type = 'yearly' AND is_active = true AND valid_until > now()
    ),
    -- Recent conversation threads (max 5)
    'recentThreads', COALESCE((
      SELECT jsonb_agg(row_to_json(sub) ORDER BY sub.last_message_at DESC)
      FROM (
        SELECT c.subject, c.status, c.last_message_at
        FROM public.conversations c
        WHERE c.user_id = v_uid
        ORDER BY c.last_message_at DESC
        LIMIT 5
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.profiles p
  WHERE p.id = v_uid;

  RETURN COALESCE(v_result, jsonb_build_object('userId', null, 'email', p_address, 'isGuest', true));
END;
$$;
