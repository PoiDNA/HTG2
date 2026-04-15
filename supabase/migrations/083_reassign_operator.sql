-- Migration 083: admin — post-hoc operator reassign on existing booking
-- =====================================================================
-- Allows admin to swap the assistant (operator) on an existing booking's slot,
-- validating availability (rules + exceptions + conflicts) of the target
-- assistant via the existing check_staff_availability RPC.
--
-- Only mutates booking_slots.assistant_id. Does NOT change session_type nor
-- touch bookings row (session semantics unchanged).

CREATE OR REPLACE FUNCTION public.reassign_operator_on_booking(
  p_booking_id  UUID,
  p_assistant_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_booking   RECORD;
  v_slot      RECORD;
  v_assistant RECORD;
  v_available BOOLEAN;
BEGIN
  -- Resolve booking + slot
  SELECT b.id, b.slot_id, b.status
    INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'booking_not_found'::TEXT;
    RETURN;
  END IF;

  IF v_booking.status NOT IN ('pending_confirmation','confirmed','completed') THEN
    RETURN QUERY SELECT false, ('cannot_reassign_status_' || v_booking.status)::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_slot
  FROM public.booking_slots
  WHERE id = v_booking.slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'slot_not_found'::TEXT;
    RETURN;
  END IF;

  -- Session type must include an operator slot
  IF v_slot.session_type NOT IN ('natalia_asysta','natalia_agata','natalia_justyna') THEN
    RETURN QUERY SELECT false, ('session_type_has_no_operator_' || v_slot.session_type)::TEXT;
    RETURN;
  END IF;

  -- Validate assistant
  SELECT * INTO v_assistant
  FROM public.staff_members
  WHERE id = p_assistant_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'assistant_not_found'::TEXT;
    RETURN;
  END IF;

  IF v_assistant.role NOT IN ('assistant','operator') THEN
    RETURN QUERY SELECT false, ('wrong_role_' || v_assistant.role)::TEXT;
    RETURN;
  END IF;

  IF v_assistant.is_active = false THEN
    RETURN QUERY SELECT false, 'assistant_inactive'::TEXT;
    RETURN;
  END IF;

  -- No-op if same operator
  IF v_slot.assistant_id = p_assistant_id THEN
    RETURN QUERY SELECT true, 'no_change'::TEXT;
    RETURN;
  END IF;

  -- Advisory lock per target assistant — serialize concurrent reassigns
  PERFORM pg_advisory_xact_lock(hashtext(p_assistant_id::text));

  -- Check assistant availability (rules + exceptions + no overlapping slots),
  -- excluding the current slot from conflict counting.
  SELECT public.check_staff_availability(
    ARRAY[p_assistant_id]::UUID[],
    v_slot.slot_date,
    v_slot.start_time,
    v_slot.end_time,
    v_slot.id
  ) INTO v_available;

  IF NOT v_available THEN
    RETURN QUERY SELECT false, 'assistant_not_available'::TEXT;
    RETURN;
  END IF;

  -- Perform reassign
  UPDATE public.booking_slots
  SET assistant_id = p_assistant_id,
      updated_at   = now()
  WHERE id = v_slot.id;

  RETURN QUERY SELECT true, 'reassigned'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reassign_operator_on_booking(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.reassign_operator_on_booking(UUID, UUID) IS
  'Admin-only post-hoc operator reassign on a booking slot. Validates assistant role/active/availability with advisory lock per target assistant. Only touches booking_slots.assistant_id.';
