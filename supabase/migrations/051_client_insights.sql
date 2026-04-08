-- ============================================================
-- 039: Client journey analytics — transcripts + insights (3 phases)
--
-- Adds infrastructure for AI analysis of client sessions:
-- - per-participant audio track egresses via startTrackEgress
-- - normalized analytics_track_egresses table (keeps live_sessions hot-path untouched)
-- - new consent RPC (bez constraintu na fazę, kontra check_recording_consent)
-- - claim/find RPCs for cron pipeline
-- - session_client_insights storage
--
-- Legacy complete_session_track_egress (migration 009) is NOT modified — analytics
-- egresses flow through a separate webhook branch.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Race-guard columns on live_sessions for atomic claim of analytics start
--    (sesja doesn't need one — relies on helper count-based race guard)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS analytics_wstep_claimed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analytics_podsumowanie_claimed_at TIMESTAMPTZ;


-- ────────────────────────────────────────────────────────────
-- 2. Index for cron: phase='ended' (existing index is WHERE phase NOT IN ('ended'))
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_live_sessions_phase_ended
  ON public.live_sessions(phase)
  WHERE phase = 'ended';


-- ────────────────────────────────────────────────────────────
-- 3. Normalized track egress table (no JSONB columns on live_sessions)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_track_egresses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id       UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  phase                 TEXT NOT NULL CHECK (phase IN ('wstep','sesja','podsumowanie')),
  participant_identity  TEXT NOT NULL,
  track_sid             TEXT NOT NULL,
  egress_id             TEXT NOT NULL UNIQUE,
  file_url              TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at              TIMESTAMPTZ,
  UNIQUE (live_session_id, phase, participant_identity, track_sid)
);

CREATE INDEX IF NOT EXISTS idx_ate_session_phase ON public.analytics_track_egresses(live_session_id, phase);
CREATE INDEX IF NOT EXISTS idx_ate_pending       ON public.analytics_track_egresses(egress_id) WHERE file_url IS NULL;

ALTER TABLE public.analytics_track_egresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ate_admin_all ON public.analytics_track_egresses;
CREATE POLICY ate_admin_all ON public.analytics_track_egresses FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);


-- ────────────────────────────────────────────────────────────
-- 4. Helper: count keys in JSONB (used by cron candidate query)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jsonb_object_keys_count(j JSONB)
RETURNS INT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE WHEN j IS NULL THEN 0
              ELSE (SELECT count(*)::int FROM jsonb_object_keys(j)) END;
$$;


-- ────────────────────────────────────────────────────────────
-- 5. check_analytics_consent — lighter consent check bez constraint na fazę
--    (legacy check_recording_consent wymaga phase='sesja' — nie użyteczne dla wstep/podsumowanie)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_analytics_consent(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking       bookings%ROWTYPE;
  v_required      INT;
  v_capture_count INT;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF v_booking IS NULL THEN RETURN false; END IF;

  -- natalia_para zawsze wymaga 2 consents (ten sam model co migracja 036)
  v_required := CASE WHEN v_booking.session_type = 'natalia_para' THEN 2 ELSE 1 END;

  SELECT count(DISTINCT user_id) INTO v_capture_count
    FROM public.consent_records
   WHERE booking_id = p_booking_id
     AND consent_type = 'session_recording_capture'
     AND granted = true;

  RETURN v_capture_count >= v_required;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_analytics_consent(UUID) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_analytics_consent(UUID) TO service_role;


-- ────────────────────────────────────────────────────────────
-- 6. session_client_insights — pipeline output storage
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_client_insights (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id           UUID NOT NULL UNIQUE REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  booking_id                UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_user_ids           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Full speaker-labeled transcript (art. 9 RODO — see PRE-2)
  transcript                JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_model          TEXT DEFAULT 'whisper-1',

  -- Structured insights (each item has `phase` field)
  problems                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  emotional_states          JSONB NOT NULL DEFAULT '[]'::jsonb,
  life_events               JSONB NOT NULL DEFAULT '[]'::jsonb,
  goals                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  breakthroughs             JSONB NOT NULL DEFAULT '[]'::jsonb,
  journey_summary           TEXT,
  summary                   TEXT,

  analysis_model            TEXT,
  analysis_prompt_version   TEXT,
  analyzed_at               TIMESTAMPTZ,

  status                    TEXT NOT NULL DEFAULT 'processing'
                            CHECK (status IN ('processing','ready','failed')),
  error                     TEXT,  -- enum-like code only, NEVER raw model output
  retry_count               INT NOT NULL DEFAULT 0,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sci_booking    ON public.session_client_insights(booking_id);
CREATE INDEX IF NOT EXISTS idx_sci_status     ON public.session_client_insights(status);
CREATE INDEX IF NOT EXISTS idx_sci_updated_at ON public.session_client_insights(updated_at);

ALTER TABLE public.session_client_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sci_admin_all ON public.session_client_insights;
CREATE POLICY sci_admin_all ON public.session_client_insights FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);


-- ────────────────────────────────────────────────────────────
-- 7. claim_analytics_session — atomic claim RPC
--    Supabase JS .upsert() nie wspiera warunkowego ON CONFLICT DO UPDATE WHERE,
--    więc dedykowana funkcja. v8 fix: INSERT RETURNING dla fresh claim +
--    oddzielny UPDATE dla retry/stale. Pierwszy sukces zwracany natychmiast.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_analytics_session(
  p_live_session_id UUID,
  p_booking_id      UUID
) RETURNS TABLE(id UUID, retry_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    UUID;
  v_retry INT;
BEGIN
  -- Fresh insert path (first run)
  INSERT INTO public.session_client_insights (live_session_id, booking_id, status, retry_count)
  VALUES (p_live_session_id, p_booking_id, 'processing', 0)
  ON CONFLICT (live_session_id) DO NOTHING
  RETURNING session_client_insights.id, session_client_insights.retry_count
  INTO v_id, v_retry;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_retry;
    RETURN;
  END IF;

  -- Retry / stale recovery path (row already existed)
  RETURN QUERY
  UPDATE public.session_client_insights sci
     SET status      = 'processing',
         retry_count = sci.retry_count + 1,
         updated_at  = now()
   WHERE sci.live_session_id = p_live_session_id
     AND ((sci.status = 'processing' AND sci.updated_at < now() - INTERVAL '20 minutes')
          OR (sci.status = 'failed' AND sci.retry_count < 3))
  RETURNING sci.id, sci.retry_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_analytics_session(UUID, UUID) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_analytics_session(UUID, UUID) TO service_role;


-- ────────────────────────────────────────────────────────────
-- 8. find_next_analytics_candidate — cron candidate finder with 2h grace period
--    Grace anchor: live_sessions.ended_at (correct for long sessions)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_next_analytics_candidate()
RETURNS TABLE(id UUID, booking_id UUID)
LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT ls.id, ls.booking_id
  FROM public.live_sessions ls
  LEFT JOIN public.session_client_insights sci ON sci.live_session_id = ls.id
  WHERE ls.phase = 'ended'
    AND ls.ended_at IS NOT NULL
    -- At least one completed track egress (file_url ready)
    AND EXISTS (
      SELECT 1 FROM public.analytics_track_egresses ate
      WHERE ate.live_session_id = ls.id
        AND ate.file_url IS NOT NULL
    )
    -- No pending tracks, unless 2h passed since session end (grace for lost webhooks)
    AND (
      ls.ended_at < now() - INTERVAL '2 hours'
      OR NOT EXISTS (
        SELECT 1 FROM public.analytics_track_egresses ate
        WHERE ate.live_session_id = ls.id
          AND ate.file_url IS NULL
      )
    )
    -- Not processed yet, OR failed with retry<3, OR stale processing (20 min)
    AND (sci.id IS NULL
         OR (sci.status = 'failed' AND sci.retry_count < 3)
         OR (sci.status = 'processing' AND sci.updated_at < now() - INTERVAL '20 minutes'))
  ORDER BY ls.created_at ASC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_next_analytics_candidate() FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.find_next_analytics_candidate() TO service_role;
