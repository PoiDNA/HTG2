-- Migration 100: live_mode field for natalia_solo bookings
-- Tracks whether a 1:1 session has a live (in-person Warsaw) request/confirmation.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS live_mode TEXT
    CHECK (live_mode IN ('requested', 'confirmed_live', 'confirmed_online'));

COMMENT ON COLUMN public.bookings.live_mode IS
  'Live session mode for natalia_solo:
   requested       — client requested live (Warsaw)
   confirmed_live  — confirmed live in Warsaw
   confirmed_online — confirmed online only
   NULL            — standard (no live option selected)';
