-- Migration 005: Live sessions — audio/video session rooms with phases and recording
-- =================================================================================

-- ============================================================
-- 1. Live sessions table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  slot_id UUID NOT NULL REFERENCES public.booking_slots(id),
  room_name TEXT UNIQUE NOT NULL,
  room_sid TEXT,
  phase TEXT NOT NULL DEFAULT 'poczekalnia'
    CHECK (phase IN ('poczekalnia','wstep','przejscie_1','sesja',
                     'przejscie_2','podsumowanie','outro','ended')),
  phase_changed_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  -- Recording egress IDs per phase
  egress_wstep_id TEXT,
  egress_sesja_id TEXT,
  egress_sesja_tracks_ids JSONB,   -- {"natalia":"egress_id","client":"egress_id"}
  egress_podsumowanie_id TEXT,
  -- Recording URLs per phase
  recording_wstep_url TEXT,         -- MP4 admin only
  recording_sesja_url TEXT,          -- MP4 klient + admin
  recording_sesja_tracks JSONB,      -- {"natalia":"wav_url","client":"wav_url"} admin only
  recording_podsumowanie_url TEXT,   -- MP4 admin only
  bunny_sesja_video_id TEXT,         -- Bunny Stream ID for klient VOD
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_live_sessions_booking ON public.live_sessions(booking_id);
CREATE INDEX idx_live_sessions_room ON public.live_sessions(room_name);
CREATE INDEX idx_live_sessions_phase ON public.live_sessions(phase) WHERE phase NOT IN ('ended');

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Users can see their own live sessions (via booking)
CREATE POLICY live_sessions_own_read ON public.live_sessions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = live_sessions.booking_id
      AND bookings.user_id = auth.uid()
  ));

-- Staff (admin/moderator) full access
CREATE POLICY live_sessions_staff_all ON public.live_sessions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  ));

-- ============================================================
-- 2. Add live_session_id to bookings
-- ============================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS live_session_id UUID REFERENCES public.live_sessions(id);

-- ============================================================
-- 3. Enable realtime for live_sessions (phase changes)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
