-- Migration 076: Typed reserve slot + pre_reserve_snapshot + atomic confirm/cancel RPCs
-- =====================================================================================
-- 1. Add pre_reserve_snapshot JSONB to booking_slots (enables full state reversion on hold expiry)
-- 2. Data migration: revert available natalia_agata/justyna/przemek slots → natalia_solo
-- 3. Extend reserve_slot RPC: +session_type, +assistant_id, +translator_id, +end_time params;
--    advisory lock per assistant; snapshot save; atomic slot type update
-- 4. New RPC confirm_booking_by_payment (webhook-only, SECURITY DEFINER, no user_id check)
-- 5. New RPC cancel_booking_by_user (SECURITY DEFINER, with snapshot reversion)
-- 6. Update expire_held_slots + confirm_booking (expired path) + transfer_booking to restore snapshot

-- ─── 1. Schema: pre_reserve_snapshot ────────────────────────────────────────

ALTER TABLE public.booking_slots
  ADD COLUMN IF NOT EXISTS pre_reserve_snapshot JSONB;

-- ─── 2. Data migration: available per-operator slots → natalia_solo ──────────

UPDATE public.booking_slots
SET session_type         = 'natalia_solo',
    assistant_id         = NULL,
    end_time             = (start_time::time + interval '120 minutes')::time,
    pre_reserve_snapshot = NULL
WHERE session_type IN ('natalia_agata', 'natalia_justyna', 'natalia_przemek')
  AND status = 'available';

-- ─── 3. Extended reserve_slot RPC ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_slot(
  p_slot_id       UUID,
  p_user_id       UUID,
  p_topics        TEXT    DEFAULT NULL,
  p_session_type  TEXT    DEFAULT NULL,
  p_assistant_id  UUID    DEFAULT NULL,
  p_translator_id UUID    DEFAULT NULL,
  p_end_time      TIME    DEFAULT NULL
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

  -- Advisory lock per assistant: serializes concurrent reserves for same assistant
  -- Prevents race condition where two users grab the same assistant simultaneously
  IF p_assistant_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_assistant_id::text));
  END IF;

  -- Atomic slot type update (with snapshot for reversion on expiry/cancel)
  IF p_session_type IS NOT NULL THEN
    UPDATE public.booking_slots SET
      pre_reserve_snapshot = jsonb_build_object(
        'session_type', session_type,
        'assistant_id', assistant_id::text,
        'translator_id', translator_id::text,
        'end_time', end_time::text
      ),
      session_type  = p_session_type,
      assistant_id  = COALESCE(p_assistant_id, assistant_id),
      translator_id = COALESCE(p_translator_id, translator_id),
      end_time      = COALESCE(p_end_time, end_time)
    WHERE id = p_slot_id AND status = 'available';

    -- Re-fetch after update (another transaction may have raced between our SELECT and UPDATE)
    SELECT * INTO v_slot FROM public.booking_slots WHERE id = p_slot_id;
    IF NOT FOUND OR v_slot.status != 'available' THEN
      RETURN QUERY SELECT false, 'slot_taken_during_update'::TEXT, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- Per-resource conflict check (uses updated slot state)
  IF public.check_slot_resource_conflict(p_slot_id) THEN
    -- Revert snapshot if we modified the slot
    IF p_session_type IS NOT NULL AND v_slot.pre_reserve_snapshot IS NOT NULL THEN
      UPDATE public.booking_slots SET
        session_type  = COALESCE(v_slot.pre_reserve_snapshot->>'session_type', session_type),
        assistant_id  = (v_slot.pre_reserve_snapshot->>'assistant_id')::uuid,
        translator_id = (v_slot.pre_reserve_snapshot->>'translator_id')::uuid,
        end_time      = COALESCE((v_slot.pre_reserve_snapshot->>'end_time')::time, end_time),
        pre_reserve_snapshot = NULL
      WHERE id = p_slot_id;
    END IF;
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
  SET status       = 'held',
      held_for_user = p_user_id,
      held_until    = now() + interval '24 hours',
      updated_at    = now()
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

-- ─── 4. New RPC: confirm_booking_by_payment (webhook only) ───────────────────
-- Called by Stripe webhook with service_role. No user_id ownership check.
-- Uses pre_reserve_snapshot for expired-path slot reversion.

CREATE OR REPLACE FUNCTION public.confirm_booking_by_payment(p_booking_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'booking_not_found'::TEXT;
    RETURN;
  END IF;

  IF v_booking.status != 'pending_confirmation' THEN
    -- Duplicate Stripe event, already confirmed, or cancelled — safe to ignore
    RETURN QUERY SELECT false, ('booking_status_' || v_booking.status)::TEXT;
    RETURN;
  END IF;

  IF v_booking.expires_at < now() THEN
    -- Hold expired before Stripe payment completed — cancel + restore slot, flag for refund
    UPDATE public.bookings
      SET status = 'cancelled', cancelled_at = now()
      WHERE id = p_booking_id;

    UPDATE public.booking_slots
    SET status               = 'available',
        held_for_user        = NULL,
        held_until           = NULL,
        session_type         = COALESCE(pre_reserve_snapshot->>'session_type', session_type),
        assistant_id         = (pre_reserve_snapshot->>'assistant_id')::uuid,
        translator_id        = (pre_reserve_snapshot->>'translator_id')::uuid,
        end_time             = COALESCE((pre_reserve_snapshot->>'end_time')::time, end_time),
        pre_reserve_snapshot = NULL,
        updated_at           = now()
    WHERE id = v_booking.slot_id;

    RETURN QUERY SELECT false, 'booking_expired_needs_refund'::TEXT;
    RETURN;
  END IF;

  -- Atomic confirm: update booking + slot in one transaction
  UPDATE public.bookings
  SET status               = 'confirmed',
      confirmed_at         = now(),
      payment_status       = 'confirmed_paid',
      expires_at           = NULL
  WHERE id = p_booking_id;

  UPDATE public.booking_slots
  SET status               = 'booked',
      held_until           = NULL,
      held_for_user        = NULL,
      pre_reserve_snapshot = NULL,
      updated_at           = now()
  WHERE id = v_booking.slot_id;

  RETURN QUERY SELECT true, 'booking_confirmed'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 5. New RPC: cancel_booking_by_user ──────────────────────────────────────
-- Replaces raw UPDATE in /api/booking/cancel route.
-- SECURITY DEFINER ensures it can update all columns (session_type, pre_reserve_snapshot)
-- regardless of user RLS policies.

CREATE OR REPLACE FUNCTION public.cancel_booking_by_user(p_booking_id UUID, p_user_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::TEXT;
    RETURN;
  END IF;

  IF v_booking.status NOT IN ('pending_confirmation', 'confirmed') THEN
    RETURN QUERY SELECT false, ('cannot_cancel_' || v_booking.status)::TEXT;
    RETURN;
  END IF;

  UPDATE public.bookings
  SET status       = 'cancelled',
      cancelled_at = now()
  WHERE id = p_booking_id;

  -- Release slot and restore pre-reserve state (handles natalia_asysta → natalia_solo reversion)
  UPDATE public.booking_slots
  SET status               = 'available',
      held_for_user        = NULL,
      held_until           = NULL,
      session_type         = COALESCE(pre_reserve_snapshot->>'session_type', session_type),
      assistant_id         = (pre_reserve_snapshot->>'assistant_id')::uuid,
      translator_id        = (pre_reserve_snapshot->>'translator_id')::uuid,
      end_time             = COALESCE((pre_reserve_snapshot->>'end_time')::time, end_time),
      pre_reserve_snapshot = NULL,
      updated_at           = now()
  WHERE id = v_booking.slot_id;

  RETURN QUERY SELECT true, 'cancelled'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 6. Update expire_held_slots: restore pre_reserve_snapshot on expiry ─────

CREATE OR REPLACE FUNCTION public.expire_held_slots()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Expire booking_slots: restore snapshot state (session_type, assistant_id, etc.)
  UPDATE public.booking_slots
  SET status               = 'available',
      held_for_user        = NULL,
      held_until           = NULL,
      session_type         = COALESCE(pre_reserve_snapshot->>'session_type', session_type),
      assistant_id         = (pre_reserve_snapshot->>'assistant_id')::uuid,
      translator_id        = (pre_reserve_snapshot->>'translator_id')::uuid,
      end_time             = COALESCE((pre_reserve_snapshot->>'end_time')::time, end_time),
      pre_reserve_snapshot = NULL,
      updated_at           = now()
  WHERE status = 'held' AND held_until < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Cancel corresponding bookings
  UPDATE public.bookings
  SET status       = 'cancelled',
      cancelled_at = now()
  WHERE status   = 'pending_confirmation'
    AND expires_at < now();

  -- Expire offered acceleration queue entries
  UPDATE public.acceleration_queue
  SET status = 'expired'
  WHERE status     = 'offered'
    AND offered_at < now() - interval '24 hours';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 7. Update confirm_booking (expired auto-cancel path): restore snapshot ──
-- confirm_booking is called by user (requires user_id). Only the expired path
-- releases the slot — we need it to restore the snapshot too.

CREATE OR REPLACE FUNCTION public.confirm_booking(
  p_booking_id UUID,
  p_user_id    UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Booking not found'::TEXT;
    RETURN;
  END IF;

  IF v_booking.status != 'pending_confirmation' THEN
    RETURN QUERY SELECT false, ('Booking status is: ' || v_booking.status)::TEXT;
    RETURN;
  END IF;

  -- Check if expired
  IF v_booking.expires_at < now() THEN
    -- Auto-expire: cancel booking + restore slot snapshot
    UPDATE public.bookings
      SET status = 'cancelled', cancelled_at = now()
      WHERE id = p_booking_id;

    UPDATE public.booking_slots
    SET status               = 'available',
        held_for_user        = NULL,
        held_until           = NULL,
        session_type         = COALESCE(pre_reserve_snapshot->>'session_type', session_type),
        assistant_id         = (pre_reserve_snapshot->>'assistant_id')::uuid,
        translator_id        = (pre_reserve_snapshot->>'translator_id')::uuid,
        end_time             = COALESCE((pre_reserve_snapshot->>'end_time')::time, end_time),
        pre_reserve_snapshot = NULL,
        updated_at           = now()
    WHERE id = v_booking.slot_id;

    RETURN QUERY SELECT false, 'Booking has expired'::TEXT;
    RETURN;
  END IF;

  -- Confirm (normal path — no snapshot involved, slot stays as-is)
  UPDATE public.bookings
    SET status = 'confirmed', confirmed_at = now()
    WHERE id = p_booking_id;

  UPDATE public.booking_slots
    SET status = 'booked', held_until = NULL, updated_at = now()
    WHERE id = v_booking.slot_id;

  RETURN QUERY SELECT true, 'Booking confirmed'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 8. Update transfer_booking: restore snapshot on old slot release ─────────

CREATE OR REPLACE FUNCTION public.transfer_booking(
  p_booking_id   UUID,
  p_new_slot_id  UUID,
  p_user_id      UUID
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

  -- Release OLD slot: restore snapshot (reverts natalia_asysta → natalia_solo etc.)
  UPDATE public.booking_slots
  SET status               = 'available',
      held_for_user        = NULL,
      held_until           = NULL,
      session_type         = COALESCE(pre_reserve_snapshot->>'session_type', session_type),
      assistant_id         = (pre_reserve_snapshot->>'assistant_id')::uuid,
      translator_id        = (pre_reserve_snapshot->>'translator_id')::uuid,
      end_time             = COALESCE((pre_reserve_snapshot->>'end_time')::time, end_time),
      pre_reserve_snapshot = NULL,
      updated_at           = now()
  WHERE id = v_old_booking.slot_id;

  UPDATE public.bookings
  SET status       = 'transferred',
      cancelled_at = now()
  WHERE id = p_booking_id;

  UPDATE public.booking_slots
  SET status        = 'booked',
      held_for_user = p_user_id,
      updated_at    = now()
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
