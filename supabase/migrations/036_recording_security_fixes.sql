-- ============================================================
-- 036: Recording Security Fixes
-- 1. check_recording_consent: para always requires 2 consents + SECURITY DEFINER hardening
-- 2. Drop bra_own_update policy (self-service revoke via backend only)
-- 3. Add legal_hold_set_at column for governance reminders
-- 4. webhook_events table for Supabase Auth Webhook idempotency
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Fix RPC: para ALWAYS requires 2 consents
--    SECURITY DEFINER + SET search_path + REVOKE FROM PUBLIC/authenticated
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_recording_consent(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_session live_sessions%ROWTYPE;
  v_booking bookings%ROWTYPE;
  v_capture_count INT;
  v_required_count INT;
BEGIN
  -- Lock sesji zapobiega race condition przy concurrent consent
  SELECT * INTO v_session FROM live_sessions
    WHERE booking_id = p_booking_id
    FOR UPDATE;

  IF v_session IS NULL OR v_session.phase != 'sesja' THEN
    RETURN jsonb_build_object('can_start', false, 'reason', 'not_in_sesja_phase');
  END IF;

  IF v_session.egress_sesja_id IS NOT NULL THEN
    RETURN jsonb_build_object('can_start', false, 'reason', 'already_recording');
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;

  -- FIXED: natalia_para ALWAYS requires 2 consents
  -- regardless of booking_companions.user_id (partner may not have an account yet)
  -- Previous: 1 + count(companions with user_id) — WRONG, could be 1 if partner not registered
  IF v_booking.session_type = 'natalia_para' THEN
    v_required_count := 2;
  ELSE
    v_required_count := 1;
  END IF;

  -- Ile osób wyraziło zgodę capture?
  SELECT count(DISTINCT user_id) INTO v_capture_count
  FROM consent_records
  WHERE booking_id = p_booking_id
    AND consent_type = 'session_recording_capture'
    AND granted = true;

  IF v_capture_count >= v_required_count THEN
    RETURN jsonb_build_object(
      'can_start', true,
      'session_id', v_session.id,
      'room_name', v_session.room_name
    );
  ELSE
    RETURN jsonb_build_object(
      'can_start', false,
      'reason', 'waiting_for_consent',
      'have', v_capture_count,
      'need', v_required_count
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_catalog;

-- Restrict execution to service_role only
-- Prevents IDOR via PostgREST: function accepts arbitrary booking_id without ownership check
REVOKE EXECUTE ON FUNCTION public.check_recording_consent(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_recording_consent(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_recording_consent(UUID) TO service_role;


-- ────────────────────────────────────────────────────────────
-- 2. Drop bra_own_update — self-service revoke goes through
--    backend endpoint only (service_role bypasses RLS)
--    RLS cannot restrict which columns are updated, so the
--    safer model is: no UPDATE for authenticated at all.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS bra_own_update ON public.booking_recording_access;


-- ────────────────────────────────────────────────────────────
-- 3. Add legal_hold_set_at for governance reminders
--    Cron checks: legal_hold = true AND legal_hold_set_at < now() - 30 days
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.booking_recordings
  ADD COLUMN IF NOT EXISTS legal_hold_set_at TIMESTAMPTZ;


-- ────────────────────────────────────────────────────────────
-- 4. webhook_events — idempotency for Supabase Auth Webhook
--    Prevents duplicate processing of user.deleted events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies — service role bypasses RLS. Authenticated users have no access.
