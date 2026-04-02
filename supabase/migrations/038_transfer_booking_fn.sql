-- Ensure check_natalia_conflict and transfer_booking functions exist
-- (originally in 003_booking_system.sql but may not have been applied to production).

-- Helper: check Natalia time conflict across all session types
CREATE OR REPLACE FUNCTION public.check_natalia_conflict(
  p_date DATE,
  p_start TIME,
  p_end TIME,
  p_exclude_slot_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_slots
  WHERE slot_date = p_date
    AND status IN ('held', 'booked')
    AND (p_exclude_slot_id IS NULL OR id != p_exclude_slot_id)
    AND (start_time, end_time) OVERLAPS (p_start, p_end);

  RETURN v_conflict_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Transfer an existing booking to a new available slot
CREATE OR REPLACE FUNCTION public.transfer_booking(
  p_booking_id UUID,
  p_new_slot_id UUID,
  p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT, new_booking_id UUID) AS $$
DECLARE
  v_old_booking RECORD;
  v_new_slot RECORD;
  v_new_booking_id UUID;
BEGIN
  -- Lock old booking
  SELECT * INTO v_old_booking
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = p_user_id AND status IN ('pending_confirmation', 'confirmed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Original booking not found or not active'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Lock new slot
  SELECT * INTO v_new_slot
  FROM public.booking_slots
  WHERE id = p_new_slot_id AND status = 'available'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'New slot is not available'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check Natalia conflict for new slot
  IF public.check_natalia_conflict(v_new_slot.slot_date, v_new_slot.start_time, v_new_slot.end_time, p_new_slot_id) THEN
    RETURN QUERY SELECT false, 'Time conflict with another session'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Release old slot
  UPDATE public.booking_slots
  SET status = 'available', held_for_user = NULL, held_until = NULL, updated_at = now()
  WHERE id = v_old_booking.slot_id;

  -- Mark old booking as transferred
  UPDATE public.bookings SET status = 'transferred', cancelled_at = now() WHERE id = p_booking_id;

  -- Book new slot
  UPDATE public.booking_slots
  SET status = 'booked', held_for_user = p_user_id, updated_at = now()
  WHERE id = p_new_slot_id;

  -- Create new booking
  INSERT INTO public.bookings (
    user_id, slot_id, session_type, status, topics,
    order_id, entitlement_id, assigned_at, confirmed_at
  ) VALUES (
    p_user_id, p_new_slot_id, v_new_slot.session_type,
    'confirmed', v_old_booking.topics,
    v_old_booking.order_id, v_old_booking.entitlement_id,
    now(), now()
  )
  RETURNING id INTO v_new_booking_id;

  RETURN QUERY SELECT true, 'Booking transferred successfully'::TEXT, v_new_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
