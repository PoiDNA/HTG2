-- Migration 101: reschedule proposal for bookings
-- Allows proposing a new date/time without immediately moving the booking.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS proposed_slot_date DATE,
  ADD COLUMN IF NOT EXISTS proposed_start_time TIME,
  ADD COLUMN IF NOT EXISTS reschedule_status TEXT
    CHECK (reschedule_status IN ('pending'));

COMMENT ON COLUMN public.bookings.proposed_slot_date IS
  'Proposed new date when a reschedule is pending confirmation by the client.';
COMMENT ON COLUMN public.bookings.proposed_start_time IS
  'Proposed new start time for the reschedule proposal.';
COMMENT ON COLUMN public.bookings.reschedule_status IS
  'pending — a reschedule has been proposed but not yet accepted or cancelled. NULL = standard.';
