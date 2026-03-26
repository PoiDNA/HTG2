-- Migration 003: Booking system — staff, availability, slots, bookings, acceleration queue
-- =========================================================================================

-- ============================================================
-- 1. Staff members (Natalia, Agata, Justyna)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('practitioner', 'assistant')),
  session_types TEXT[] NOT NULL DEFAULT '{}',
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_public_read ON public.staff_members FOR SELECT USING (is_active = true);

-- ============================================================
-- 2. Availability rules (weekly recurring schedule)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

CREATE INDEX idx_avail_rules_staff ON public.availability_rules(staff_id, day_of_week);

ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY avail_rules_public_read ON public.availability_rules FOR SELECT USING (is_active = true);
CREATE POLICY avail_rules_admin_all ON public.availability_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- ============================================================
-- 3. Availability exceptions (blocked dates, vacations)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  all_day BOOLEAN DEFAULT true,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(staff_id, exception_date, start_time)
);

CREATE INDEX idx_avail_exceptions_staff ON public.availability_exceptions(staff_id, exception_date);

ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY avail_exceptions_public_read ON public.availability_exceptions FOR SELECT USING (true);
CREATE POLICY avail_exceptions_admin_all ON public.availability_exceptions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- ============================================================
-- 4. Booking slots (concrete time slots)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type TEXT NOT NULL CHECK (session_type IN ('natalia_solo', 'natalia_agata', 'natalia_justyna')),
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'held', 'booked', 'completed', 'cancelled')),
  held_for_user UUID REFERENCES auth.users(id),
  held_until TIMESTAMPTZ,
  is_extra BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_slots_available ON public.booking_slots(slot_date, status) WHERE status = 'available';
CREATE INDEX idx_slots_held_expiry ON public.booking_slots(held_until) WHERE status = 'held';
CREATE INDEX idx_slots_session_type ON public.booking_slots(session_type, slot_date);
CREATE INDEX idx_slots_date ON public.booking_slots(slot_date);

ALTER TABLE public.booking_slots ENABLE ROW LEVEL SECURITY;
-- Users can see available slots + their own held/booked slots
CREATE POLICY slots_user_read ON public.booking_slots FOR SELECT
  USING (status = 'available' OR held_for_user = auth.uid() OR
    EXISTS (SELECT 1 FROM public.bookings WHERE slot_id = booking_slots.id AND user_id = auth.uid()));
-- Admin full access
CREATE POLICY slots_admin_all ON public.booking_slots FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- ============================================================
-- 5. Bookings (user reservations)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  slot_id UUID NOT NULL REFERENCES public.booking_slots(id),
  session_type TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id),
  entitlement_id UUID REFERENCES public.entitlements(id),
  status TEXT NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('pending_confirmation', 'confirmed', 'completed', 'cancelled', 'transferred')),
  topics TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bookings_user ON public.bookings(user_id, status);
CREATE INDEX idx_bookings_slot ON public.bookings(slot_id);
CREATE INDEX idx_bookings_expires ON public.bookings(expires_at) WHERE status = 'pending_confirmation';

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_own_read ON public.bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY bookings_own_insert ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY bookings_own_update ON public.bookings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY bookings_admin_all ON public.bookings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- ============================================================
-- 6. Acceleration queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.acceleration_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_type TEXT NOT NULL,
  booking_id UUID REFERENCES public.bookings(id),
  priority SMALLINT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')),
  offered_slot_id UUID REFERENCES public.booking_slots(id),
  offered_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_accel_queue_status ON public.acceleration_queue(status, session_type);
CREATE INDEX idx_accel_queue_user ON public.acceleration_queue(user_id);

ALTER TABLE public.acceleration_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY accel_own_read ON public.acceleration_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY accel_own_insert ON public.acceleration_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY accel_admin_all ON public.acceleration_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- ============================================================
-- 7. CRITICAL: Natalia conflict check
-- Natalia is in EVERY session type — no overlapping slots
-- ============================================================
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

-- ============================================================
-- 8. Atomic slot reservation with conflict check
-- ============================================================
CREATE OR REPLACE FUNCTION public.reserve_slot(
  p_slot_id UUID,
  p_user_id UUID,
  p_topics TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT, booking_id UUID) AS $$
DECLARE
  v_slot RECORD;
  v_booking_id UUID;
BEGIN
  -- Lock the slot row
  SELECT * INTO v_slot
  FROM public.booking_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Slot not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check slot is available
  IF v_slot.status != 'available' THEN
    RETURN QUERY SELECT false, 'Slot is no longer available'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check Natalia conflict (another slot may have been booked since generation)
  IF public.check_natalia_conflict(v_slot.slot_date, v_slot.start_time, v_slot.end_time, p_slot_id) THEN
    RETURN QUERY SELECT false, 'Time conflict with another session'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Hold the slot for 24 hours
  UPDATE public.booking_slots
  SET status = 'held',
      held_for_user = p_user_id,
      held_until = now() + interval '24 hours',
      updated_at = now()
  WHERE id = p_slot_id;

  -- Create booking
  INSERT INTO public.bookings (
    user_id, slot_id, session_type, status, topics,
    assigned_at, expires_at
  ) VALUES (
    p_user_id, p_slot_id, v_slot.session_type,
    'pending_confirmation', p_topics,
    now(), now() + interval '24 hours'
  )
  RETURNING id INTO v_booking_id;

  RETURN QUERY SELECT true, 'Slot reserved for 24 hours'::TEXT, v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. Confirm a held booking
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_booking(
  p_booking_id UUID,
  p_user_id UUID
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
    -- Auto-expire
    UPDATE public.bookings SET status = 'cancelled', cancelled_at = now() WHERE id = p_booking_id;
    UPDATE public.booking_slots SET status = 'available', held_for_user = NULL, held_until = NULL, updated_at = now()
    WHERE id = v_booking.slot_id;
    RETURN QUERY SELECT false, 'Booking has expired'::TEXT;
    RETURN;
  END IF;

  -- Confirm
  UPDATE public.bookings SET status = 'confirmed', confirmed_at = now() WHERE id = p_booking_id;
  UPDATE public.booking_slots SET status = 'booked', held_until = NULL, updated_at = now()
  WHERE id = v_booking.slot_id;

  RETURN QUERY SELECT true, 'Booking confirmed'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. Transfer booking to earlier slot
-- ============================================================
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

-- ============================================================
-- 11. Expire held slots (called by cron every 15 min)
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_held_slots()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Expire booking_slots
  UPDATE public.booking_slots
  SET status = 'available', held_for_user = NULL, held_until = NULL, updated_at = now()
  WHERE status = 'held' AND held_until < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Cancel corresponding bookings
  UPDATE public.bookings
  SET status = 'cancelled', cancelled_at = now()
  WHERE status = 'pending_confirmation'
    AND expires_at < now();

  -- Expire offered acceleration queue entries
  UPDATE public.acceleration_queue
  SET status = 'expired'
  WHERE status = 'offered'
    AND offered_at < now() - interval '24 hours';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. Session type config (used by app)
-- ============================================================
COMMENT ON TABLE public.booking_slots IS
'Session durations: natalia_solo=120min, natalia_agata=90min, natalia_justyna=90min.
Natalia is in ALL session types — conflict check is always against ALL slots on same date.';
