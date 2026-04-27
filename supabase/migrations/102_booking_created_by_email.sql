-- Migration 102: track who manually created a booking (staff email)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS created_by_email TEXT;

COMMENT ON COLUMN public.bookings.created_by_email IS
  'Email of the staff member who manually created this booking via the admin planer. NULL for client self-bookings.';
