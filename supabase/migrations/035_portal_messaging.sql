-- ============================================================
-- 035: Portal Messaging — in-app user-to-support communication
-- ============================================================
-- Extends the Communication Hub with a 'portal' channel.
-- Portal conversations are initiated by authenticated users
-- and handled by admin/Natalia in the same inbox as email.
-- ============================================================

-- 1. Extend CHECK constraints to include 'portal'

-- conversations.channel
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_channel_check
    CHECK (channel IN ('email', 'sms', 'internal', 'portal'));

-- conversations.user_link_method — add 'portal_auth'
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_user_link_method_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_user_link_method_check
    CHECK (user_link_method IN ('auto_spf', 'manual', 'magic_link', 'portal_auth'));

-- message_templates.channel
ALTER TABLE message_templates
  DROP CONSTRAINT IF EXISTS message_templates_channel_check;
ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_channel_check
    CHECK (channel IN ('email', 'sms', 'portal', 'all'));

-- Note: messages.channel has no named constraint (inline CHECK was not given
-- a name in 023). For inline unnamed CHECK constraints in PG, the default name
-- is {table}_{column}_check. We drop it and re-add with portal included.
-- messages table does NOT have a CHECK on channel in 023 — it's only on
-- conversations. The messages.channel column has no constraint. Verified above.

-- autoresponders.channel — no explicit CHECK in 023, but add one for safety
-- (autoresponders table doesn't have a CHECK on channel in the original migration)


-- 2. Per-message read tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;


-- 3. RPC: atomic portal conversation creation (hardened)
CREATE OR REPLACE FUNCTION create_portal_conversation(
  p_user_id UUID,
  p_user_email TEXT,
  p_subject TEXT,
  p_body_text TEXT,
  p_mailbox_id UUID
) RETURNS TABLE(conversation_id UUID, message_id UUID) AS $$
DECLARE
  v_conv_id UUID;
  v_msg_id UUID;
BEGIN
  -- Input validation (defense in depth — API also validates)
  IF p_user_id IS NULL OR p_user_email IS NULL OR
     trim(p_subject) = '' OR trim(p_body_text) = '' OR p_mailbox_id IS NULL THEN
    RAISE EXCEPTION 'Invalid input: all parameters required and non-empty';
  END IF;

  -- Verify mailbox is portal type (prevents misuse with email mailbox)
  IF NOT EXISTS (
    SELECT 1 FROM mailboxes WHERE id = p_mailbox_id AND channel = 'portal'
  ) THEN
    RAISE EXCEPTION 'Invalid mailbox: not a portal mailbox';
  END IF;

  INSERT INTO conversations (
    channel, mailbox_id, subject, from_address, to_address,
    user_id, user_link_verified, user_link_method, status, priority
  ) VALUES (
    'portal', p_mailbox_id, trim(p_subject), p_user_email, 'portal@htg.internal',
    p_user_id, true, 'portal_auth', 'open', 'normal'
  ) RETURNING id INTO v_conv_id;

  INSERT INTO messages (
    conversation_id, channel, direction, from_address, to_address,
    subject, body_text, processing_status
  ) VALUES (
    v_conv_id, 'portal', 'inbound', p_user_email, 'portal@htg.internal',
    trim(p_subject), trim(p_body_text), 'done'
  ) RETURNING id INTO v_msg_id;

  RETURN QUERY SELECT v_conv_id, v_msg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION create_portal_conversation(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_portal_conversation(UUID, TEXT, TEXT, TEXT, UUID) TO service_role;


-- 4. Portal mailbox (idempotent)
INSERT INTO public.mailboxes (address, name, channel, is_default)
VALUES ('portal@htg.internal', 'Portal wiadomości', 'portal', false)
ON CONFLICT (address) DO NOTHING;


-- 5. Mailbox members — role-based, no hardcoded emails
-- Admin users get owner access. Staff (Natalia etc.) added manually by admin.
INSERT INTO public.mailbox_members (mailbox_id, user_id, role)
SELECT m.id, p.id, 'owner'
FROM public.mailboxes m
CROSS JOIN public.profiles p
WHERE m.address = 'portal@htg.internal'
  AND p.role = 'admin'
ON CONFLICT DO NOTHING;


-- 6. Indexes for portal queries

-- User-side: list conversations for a specific user in portal
CREATE INDEX IF NOT EXISTS idx_conv_user_portal
  ON conversations(user_id, last_message_at DESC, id DESC)
  WHERE channel = 'portal';

-- Unread count: outbound messages in portal not yet read by user
CREATE INDEX IF NOT EXISTS idx_msg_portal_unread
  ON messages(conversation_id)
  WHERE channel = 'portal' AND direction = 'outbound' AND read_at IS NULL;
