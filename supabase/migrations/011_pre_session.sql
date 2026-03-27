-- Migration 011: Pre-session meetings (Spotkanie wstępne 15 min)
-- ==============================================================
-- Short 15-minute online meeting between client and assistant,
-- before the main session. Uses the same LiveKit infrastructure.
-- Natalia is NOT involved in pre-session meetings.

-- ─── 1. Extend session_type CHECK constraint ─────────────────
-- Add 'pre_session' to booking_slots and bookings tables.

ALTER TABLE public.booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_session_type_check;
ALTER TABLE public.booking_slots
  ADD CONSTRAINT booking_slots_session_type_check
  CHECK (session_type IN (
    'natalia_solo', 'natalia_agata', 'natalia_justyna', 'pre_session'
  ));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_session_type_check;
-- (bookings may not have a check constraint — safe to ignore if it fails)

-- ─── 2. Pre-session settings per assistant ───────────────────

CREATE TABLE public.pre_session_settings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id  UUID        NOT NULL UNIQUE
                               REFERENCES public.staff_members(id) ON DELETE CASCADE,
  is_enabled       BOOLEAN     NOT NULL DEFAULT false,
  duration_minutes INT         NOT NULL DEFAULT 15,
  note_for_client  TEXT,       -- optional message shown to eligible clients
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. Pre-session eligibility ──────────────────────────────
-- Tracks which clients are eligible to book a pre-session with
-- a specific assistant. Can be granted globally (is_global=true)
-- or individually by the assistant.

CREATE TABLE public.pre_session_eligibility (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_member_id   UUID        NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  source_booking_id UUID        REFERENCES public.bookings(id) ON DELETE SET NULL,
  granted_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  meeting_booked    BOOLEAN     NOT NULL DEFAULT false,
  pre_booking_id    UUID        REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, staff_member_id, source_booking_id)
);

CREATE INDEX idx_pre_eligibility_user    ON public.pre_session_eligibility(user_id);
CREATE INDEX idx_pre_eligibility_staff   ON public.pre_session_eligibility(staff_member_id);
CREATE INDEX idx_pre_eligibility_active  ON public.pre_session_eligibility(staff_member_id, is_active)
                                          WHERE is_active = true AND meeting_booked = false;

-- ─── 4. RLS ──────────────────────────────────────────────────

ALTER TABLE public.pre_session_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_session_eligibility ENABLE ROW LEVEL SECURITY;

-- Settings: service role only (managed via server actions)
CREATE POLICY "pre_session_settings_service" ON public.pre_session_settings
  FOR ALL USING (false);

-- Eligibility: service role only
CREATE POLICY "pre_session_eligibility_service" ON public.pre_session_eligibility
  FOR ALL USING (false);

-- ─── 5. Auto-grant eligibility when assistant enables feature ─
-- Function called manually after toggling ON, grants eligibility
-- to all clients who have confirmed/upcoming bookings for sessions
-- involving this assistant.

CREATE OR REPLACE FUNCTION public.grant_pre_session_to_existing_bookings(
  p_staff_member_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_staff_slug TEXT;
  v_session_types TEXT[];
BEGIN
  -- Get assistant slug to determine which session types they're in
  SELECT slug INTO v_staff_slug
  FROM staff_members WHERE id = p_staff_member_id;

  -- Map slug to session types
  v_session_types := CASE v_staff_slug
    WHEN 'agata'   THEN ARRAY['natalia_agata']
    WHEN 'justyna' THEN ARRAY['natalia_justyna']
    WHEN 'marta'   THEN ARRAY['natalia_agata', 'natalia_justyna']
    WHEN 'ania'    THEN ARRAY['natalia_agata', 'natalia_justyna']
    ELSE ARRAY[]::TEXT[]
  END;

  IF array_length(v_session_types, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Grant eligibility to all clients with upcoming confirmed bookings
  INSERT INTO public.pre_session_eligibility
    (user_id, staff_member_id, source_booking_id, granted_by, is_active)
  SELECT DISTINCT
    b.user_id,
    p_staff_member_id,
    b.id,
    p_staff_member_id,  -- granted by the assistant (via staff member)
    true
  FROM public.bookings b
  JOIN public.booking_slots bs ON bs.id = b.slot_id
  WHERE bs.session_type = ANY(v_session_types)
    AND b.status IN ('confirmed', 'pending_confirmation')
    AND bs.slot_date >= CURRENT_DATE
  ON CONFLICT (user_id, staff_member_id, source_booking_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_pre_session_to_existing_bookings(UUID) TO service_role;

COMMENT ON TABLE public.pre_session_settings IS
  'Pre-session meeting settings per assistant (ON/OFF, duration).';
COMMENT ON TABLE public.pre_session_eligibility IS
  'Tracks which clients are eligible for a pre-session with a given assistant.';
