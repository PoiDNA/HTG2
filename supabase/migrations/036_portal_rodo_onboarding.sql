-- ============================================================
-- 036: Portal RODO compliance + admin onboarding trigger
-- ============================================================

-- ─── 1. RODO: Function to delete all portal data for a user ──
-- Call this before deleting a user from auth.users.
-- Deletes portal messages first (FK), then portal conversations.
-- Email conversations are kept (SET NULL on user_id per existing behavior).
-- ============================================================

CREATE OR REPLACE FUNCTION delete_user_portal_data(p_user_id UUID)
RETURNS TABLE(deleted_conversations INT, deleted_messages INT) AS $$
DECLARE
  v_conv_ids UUID[];
  v_msg_count INT;
  v_conv_count INT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  -- Collect portal conversation IDs for this user
  SELECT array_agg(id) INTO v_conv_ids
  FROM conversations
  WHERE user_id = p_user_id AND channel = 'portal';

  IF v_conv_ids IS NULL OR array_length(v_conv_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- Delete messages first (FK constraint)
  DELETE FROM messages WHERE conversation_id = ANY(v_conv_ids);
  GET DIAGNOSTICS v_msg_count = ROW_COUNT;

  -- Delete conversations
  DELETE FROM conversations WHERE id = ANY(v_conv_ids);
  GET DIAGNOSTICS v_conv_count = ROW_COUNT;

  RETURN QUERY SELECT v_conv_count, v_msg_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION delete_user_portal_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_user_portal_data(UUID) TO service_role;

COMMENT ON FUNCTION delete_user_portal_data IS
  'RODO: Deletes all portal conversations and messages for a user. '
  'Call before deleting user from auth.users. '
  'Email conversations are NOT deleted (kept per ON DELETE SET NULL).';


-- ─── 2. RODO: Function to export portal data for a user ─────
-- Returns all portal conversations with messages as JSON.
-- For RODO data export requests.
-- ============================================================

CREATE OR REPLACE FUNCTION export_user_portal_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT coalesce(jsonb_agg(conv_data), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'conversation_id', c.id,
      'subject', c.subject,
      'status', c.status,
      'created_at', c.created_at,
      'messages', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object(
            'direction', m.direction,
            'body_text', m.body_text,
            'created_at', m.created_at
          ) ORDER BY m.created_at
        ), '[]'::jsonb)
        FROM messages m
        WHERE m.conversation_id = c.id
      )
    ) as conv_data
    FROM conversations c
    WHERE c.user_id = p_user_id AND c.channel = 'portal'
    ORDER BY c.created_at
  ) sub;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION export_user_portal_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION export_user_portal_data(UUID) TO service_role;

COMMENT ON FUNCTION export_user_portal_data IS
  'RODO: Exports all portal conversations and messages for a user as JSON.';


-- ─── 3. Onboarding: Auto-add admin to portal mailbox ────────
-- When a profile gets role='admin', auto-add to portal mailbox.
-- When role changes away from 'admin', remove from portal mailbox
-- (unless they were added manually with a different role).
-- ============================================================

CREATE OR REPLACE FUNCTION auto_manage_portal_mailbox_member()
RETURNS TRIGGER AS $$
DECLARE
  v_portal_mailbox_id UUID;
BEGIN
  -- Get portal mailbox ID
  SELECT id INTO v_portal_mailbox_id
  FROM mailboxes
  WHERE address = 'portal@htg.internal'
  LIMIT 1;

  -- No portal mailbox yet — skip silently
  IF v_portal_mailbox_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- New role is admin → add to portal mailbox
  IF NEW.role = 'admin' THEN
    INSERT INTO mailbox_members (mailbox_id, user_id, role)
    VALUES (v_portal_mailbox_id, NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Role changed FROM admin to something else → remove auto-added membership
  IF TG_OP = 'UPDATE'
     AND OLD.role = 'admin'
     AND NEW.role IS DISTINCT FROM 'admin' THEN
    DELETE FROM mailbox_members
    WHERE mailbox_id = v_portal_mailbox_id
      AND user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on INSERT (new user with admin role) and UPDATE (role change)
DROP TRIGGER IF EXISTS trg_auto_portal_mailbox ON profiles;
CREATE TRIGGER trg_auto_portal_mailbox
  AFTER INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_manage_portal_mailbox_member();

COMMENT ON FUNCTION auto_manage_portal_mailbox_member IS
  'Auto-adds users with role=admin to the portal mailbox. '
  'Removes them when role changes away from admin.';


-- ─── 4. Retencja: dokumentacja (bez auto-usuwania) ──────────
-- Portal conversations are kept indefinitely, consistent with
-- email conversations. No automatic cleanup.
-- This comment serves as documentation of the decision.
-- ============================================================
COMMENT ON TABLE conversations IS
  'Communication threads (email, sms, portal). '
  'Retencja: bezterminowa dla wszystkich kanałów. '
  'RODO: użyj delete_user_portal_data() przed usunięciem konta.';
