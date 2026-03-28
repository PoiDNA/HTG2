-- Extend entitlements.type to support individual session bookings
ALTER TABLE public.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_type_check;

ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_type_check
  CHECK (type IN ('session', 'monthly', 'yearly', 'individual_booking'));
