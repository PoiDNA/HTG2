-- Migration 075: Multi-staff conflict check + update reserve/confirm/transfer RPCs
-- =================================================================================
-- Replaces Natalia-only conflict check with per-resource (Natalia + assistant + translator).
-- Adds interpreter_locale denormalization to bookings in both reserve_slot and transfer_booking.
-- check_natalia_conflict kept as deprecated for backward compatibility.

-- ─── 1. New RPC: per-resource conflict check ────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_slot_resource_conflict(p_slot_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_slot       RECORD;
  v_conflicts  INTEGER;
BEGIN
  SELECT slot_date, start_time, end_time, assistant_id, translator_id, session_type
    INTO v_slot FROM public.booking_slots WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Natalia is in every session type except pre_session.
  -- (Note: identified implicitly by session_type != 'pre_session'. If a future
  --  session type excludes Natalia, this logic must be revised.)
  IF v_slot.session_type != 'pre_session' THEN
    SELECT COUNT(*) INTO v_conflicts
    FROM public.booking_slots
    WHERE slot_date = v_slot.slot_date
      AND id != p_slot_id
      AND status IN ('held', 'booked')
      AND session_type != 'pre_session'
      AND (start_time, end_time) OVERLAPS (v_slot.start_time, v_slot.end_time);
    IF v_conflicts > 0 THEN RETURN TRUE; END IF;
  END IF;

  -- Assistant conflict
  IF v_slot.assistant_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflicts
    FROM public.booking_slots
    WHERE slot_date = v_slot.slot_date
      AND id != p_slot_id
      AND status IN ('held', 'booked')
      AND assistant_id = v_slot.assistant_id
      AND (start_time, end_time) OVERLAPS (v_slot.start_time, v_slot.end_time);
    IF v_conflicts > 0 THEN RETURN TRUE; END IF;
  END IF;

  -- Translator conflict
  IF v_slot.translator_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflicts
    FROM public.booking_slots
    WHERE slot_date = v_slot.slot_date
      AND id != p_slot_id
      AND status IN ('held', 'booked')
      AND translator_id = v_slot.translator_id
      AND (start_time, end_time) OVERLAPS (v_slot.start_time, v_slot.end_time);
    IF v_conflicts > 0 THEN RETURN TRUE; END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 2. Deprecation note on check_natalia_conflict ──────────────────────────
-- Kept for backward compatibility with any external callers/scripts.
-- All in-repo usages migrated to check_slot_resource_conflict.

COMMENT ON FUNCTION public.check_natalia_conflict(DATE, TIME, TIME, UUID) IS
  'DEPRECATED: use check_slot_resource_conflict(slot_id) instead. Overlap check on all booking_slots regardless of resource.';

-- ─── 3. reserve_slot: multi-staff conflict + interpreter_locale ─────────────

CREATE OR REPLACE FUNCTION public.reserve_slot(
  p_slot_id UUID,
  p_user_id UUID,
  p_topics TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT, booking_id UUID) AS $$
DECLARE
  v_slot            RECORD;
  v_booking_id      UUID;
  v_translator_loc  TEXT;
BEGIN
  SELECT * INTO v_slot
  FROM public.booking_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Slot not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_slot.status != 'available' THEN
    RETURN QUERY SELECT false, 'Slot is no longer available'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Per-resource conflict check
  IF public.check_slot_resource_conflict(p_slot_id) THEN
    RETURN QUERY SELECT false, 'Time conflict with another session'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Derive interpreter_locale from translator (NULL if no translator)
  v_translator_loc := NULL;
  IF v_slot.translator_id IS NOT NULL THEN
    SELECT locale INTO v_translator_loc
    FROM public.staff_members
    WHERE id = v_slot.translator_id;
  END IF;

  UPDATE public.booking_slots
  SET status = 'held',
      held_for_user = p_user_id,
      held_until = now() + interval '24 hours',
      updated_at = now()
  WHERE id = p_slot_id;

  INSERT INTO public.bookings (
    user_id, slot_id, session_type, status, topics, interpreter_locale,
    assigned_at, expires_at
  ) VALUES (
    p_user_id, p_slot_id, v_slot.session_type,
    'pending_confirmation', p_topics, v_translator_loc,
    now(), now() + interval '24 hours'
  )
  RETURNING id INTO v_booking_id;

  RETURN QUERY SELECT true, 'Slot reserved for 24 hours'::TEXT, v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4. confirm_booking: no conflict check change needed ────────────────────
-- confirm_booking only transitions status from held->booked on an already-reserved
-- slot; no new overlap risk. Kept as-is (migration 003).

-- ─── 5. transfer_booking: multi-staff conflict + copy translator/assistant ──

CREATE OR REPLACE FUNCTION public.transfer_booking(
  p_booking_id UUID,
  p_new_slot_id UUID,
  p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT, new_booking_id UUID) AS $$
DECLARE
  v_old_booking     RECORD;
  v_new_slot        RECORD;
  v_new_booking_id  UUID;
  v_translator_loc  TEXT;
BEGIN
  SELECT * INTO v_old_booking
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = p_user_id
    AND status IN ('pending_confirmation', 'confirmed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Original booking not found or not active'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT * INTO v_new_slot
  FROM public.booking_slots
  WHERE id = p_new_slot_id AND status = 'available'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'New slot is not available'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF public.check_slot_resource_conflict(p_new_slot_id) THEN
    RETURN QUERY SELECT false, 'Time conflict with another session'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Derive interpreter_locale from the NEW slot's translator
  v_translator_loc := NULL;
  IF v_new_slot.translator_id IS NOT NULL THEN
    SELECT locale INTO v_translator_loc
    FROM public.staff_members
    WHERE id = v_new_slot.translator_id;
  END IF;

  UPDATE public.booking_slots
  SET status = 'available', held_for_user = NULL, held_until = NULL, updated_at = now()
  WHERE id = v_old_booking.slot_id;

  UPDATE public.bookings
  SET status = 'transferred', cancelled_at = now()
  WHERE id = p_booking_id;

  UPDATE public.booking_slots
  SET status = 'booked', held_for_user = p_user_id, updated_at = now()
  WHERE id = p_new_slot_id;

  -- New booking carries resource context from the NEW slot
  INSERT INTO public.bookings (
    user_id, slot_id, session_type, status, topics, interpreter_locale,
    order_id, entitlement_id, assigned_at, confirmed_at
  ) VALUES (
    p_user_id, p_new_slot_id, v_new_slot.session_type,
    'confirmed', v_old_booking.topics, v_translator_loc,
    v_old_booking.order_id, v_old_booking.entitlement_id,
    now(), now()
  )
  RETURNING id INTO v_new_booking_id;

  RETURN QUERY SELECT true, 'Booking transferred successfully'::TEXT, v_new_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 6. Helper RPC for diagnostics (not called from reserve/transfer) ───────
-- Checks whether a set of staff members are all free in the given window.
-- Used by available-slots endpoint (TypeScript intersection), but also useful
-- for admin diagnostics.

CREATE OR REPLACE FUNCTION public.check_staff_availability(
  p_staff_ids UUID[],
  p_date DATE,
  p_start TIME,
  p_end TIME,
  p_exclude_slot_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_staff_id UUID;
  v_day_of_week SMALLINT;
  v_has_rule BOOLEAN;
  v_has_exception BOOLEAN;
  v_has_conflict BOOLEAN;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_date);

  FOREACH v_staff_id IN ARRAY p_staff_ids LOOP
    -- Must have an active weekly rule covering the window
    SELECT EXISTS (
      SELECT 1 FROM public.availability_rules
      WHERE staff_id = v_staff_id
        AND day_of_week = v_day_of_week
        AND is_active = true
        AND start_time <= p_start
        AND end_time >= p_end
    ) INTO v_has_rule;

    IF NOT v_has_rule THEN RETURN FALSE; END IF;

    -- Must not be blocked by an exception
    SELECT EXISTS (
      SELECT 1 FROM public.availability_exceptions
      WHERE staff_id = v_staff_id
        AND exception_date = p_date
        AND (
          all_day = true
          OR (start_time IS NOT NULL AND end_time IS NOT NULL
              AND (start_time, end_time) OVERLAPS (p_start, p_end))
        )
    ) INTO v_has_exception;

    IF v_has_exception THEN RETURN FALSE; END IF;

    -- Must not have an overlapping slot where this staff is a resource
    -- (Natalia = all non-pre_session slots; assistant/translator = matching id)
    SELECT EXISTS (
      SELECT 1 FROM public.booking_slots
      WHERE slot_date = p_date
        AND status IN ('held', 'booked')
        AND (p_exclude_slot_id IS NULL OR id != p_exclude_slot_id)
        AND (start_time, end_time) OVERLAPS (p_start, p_end)
        AND (
          -- Natalia conflict: any non-pre_session slot (assumes p_staff_ids contains Natalia)
          (session_type != 'pre_session' AND EXISTS (
            SELECT 1 FROM public.staff_members
            WHERE id = v_staff_id AND slug = 'natalia'
          ))
          OR assistant_id = v_staff_id
          OR translator_id = v_staff_id
        )
    ) INTO v_has_conflict;

    IF v_has_conflict THEN RETURN FALSE; END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
