-- Migration 020: Sesja dla par (Couple Sessions)
-- =================================================
-- New session type 'natalia_para': 120 min, 1600 PLN, Natalia only.
-- Two clients (a couple) join the same live session room.
-- Partner is invited via email and links to the booking via invite token.

-- ─── 1. Extend session_type CHECK constraint ─────────────────────────────

ALTER TABLE public.booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_session_type_check;
ALTER TABLE public.booking_slots
  ADD CONSTRAINT booking_slots_session_type_check
  CHECK (session_type IN (
    'natalia_solo', 'natalia_agata', 'natalia_justyna', 'pre_session', 'natalia_para'
  ));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_session_type_check;
-- bookings table may use TEXT without check — ensure we're consistent

-- ─── 2. booking_companions — partner linked to a booking ─────────────────

CREATE TABLE IF NOT EXISTS public.booking_companions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email         TEXT,
  display_name  TEXT,
  invite_token  TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  UNIQUE (booking_id, email)
);

CREATE INDEX IF NOT EXISTS idx_booking_companions_booking ON public.booking_companions(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_companions_user    ON public.booking_companions(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_companions_token   ON public.booking_companions(invite_token);

ALTER TABLE public.booking_companions ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "service_companions" ON public.booking_companions;
CREATE POLICY "service_companions" ON public.booking_companions
  FOR ALL USING (true) WITH CHECK (true);
