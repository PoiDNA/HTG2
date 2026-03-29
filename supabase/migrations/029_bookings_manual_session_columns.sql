-- Migration 029: Add manual session columns to bookings
-- Allows admin to add individual sessions without a booking_slot reference.
-- Also makes slot_id nullable so manual bookings don't need a slot.

ALTER TABLE public.bookings
  ALTER COLUMN slot_id DROP NOT NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS session_date DATE,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS payment_notes TEXT;
