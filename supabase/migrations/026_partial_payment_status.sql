-- Migration 026: Add partial_payment to booking payment_status CHECK
-- ===================================================================

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('confirmed_paid', 'installments', 'partial_payment', 'pending_verification'));
