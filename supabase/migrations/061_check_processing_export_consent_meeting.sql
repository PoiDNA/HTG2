-- ═══════════════════════════════════════════════════════════════
-- 061: check_processing_export_consent_meeting (meeting-level, UC1)
--
-- Meeting-level consent gate dla UC1 (group enrichment — wzbogacenie propozycji
-- grup 5-osobowych Spotkań HTG). Uczestnicy spotkania grupowego NIE dzielą
-- wspólnego booking_id — to niezależni userzy z htg_meeting_participants.
--
-- Warunki AND:
-- 1. _user_export_consent_ok(user_id, require_sensitive)
--    — TYLKO globalne gate'y (sensitive_data + feature flags). NIE sprawdza
--      session_recording_capture ani template_generation — capture jest per
--      booking, a meeting nie jest związany z jednym konkretnym booking_id.
--
-- 2. User musi być w htg_meeting_participants (join przez htg_meeting_sessions)
--    dla danego meeting_id — ze status='joined' (faktyczne uczestnictwo, nie tylko
--    zaproszenie). htg_meeting_participants.session_id wskazuje na htg_meeting_sessions,
--    NIE na htg_meetings — jedno meeting może mieć wiele runtime sesji (różne instancje
--    wielokrotnego spotkania). Wystarczy udział w JAKIEJKOLWIEK session tego meeting.
--
-- UWAGA per capture: walidacja capture per booking ŻYJE W HANDLERZE EKSPORTU
-- (nie w tym RPC). Gdy handler buduje bookings_used[] dla danego usera, filtruje
-- per-booking przez inline consent_current sprawdzając granted=true i
-- template_generation>=1. Insights z bookingów bez valid capture NIE trafiają
-- do Dossier. Jeśli user nie ma ŻADNEGO bookingu z valid capture, Dossier ma
-- pusty session/pre/post — ale MOŻE istnieć z samymi meetings[] jeśli user
-- brał udział w Spotkaniach.
--
-- Zwraca (passed BOOLEAN, missing TEXT[]) — handler mapuje na 409.
-- Kody missing:
--   * sensitive_data | client_analytics_disabled | processing_export_disabled
--     (z _user_export_consent_ok)
--   * not_participant — user nie ma wiersza w htg_meeting_participants ze
--     status='joined' dla tego meeting_id
--
-- Patrz: docs/processing-service-plan.md §3.1 punkt 5 (UC1 meeting-level)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_processing_export_consent_meeting(
  p_meeting_id UUID,
  p_user_id UUID,
  p_require_sensitive BOOLEAN
)
RETURNS TABLE(passed BOOLEAN, missing TEXT[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing         TEXT[] := ARRAY[]::TEXT[];
  v_global_passed   BOOLEAN;
  v_global_missing  TEXT[];
  v_is_participant  BOOLEAN;
BEGIN
  -- ── Check 1: globalne gate'y (sensitive + feature flags) ────
  SELECT g.passed, g.missing INTO v_global_passed, v_global_missing
    FROM public._user_export_consent_ok(p_user_id, p_require_sensitive) g;
  IF NOT v_global_passed THEN
    v_missing := v_missing || v_global_missing;
  END IF;

  -- ── Check 2: user jest w htg_meeting_participants dla tego meeting ──
  -- Join przez htg_meeting_sessions bo participants.session_id wskazuje
  -- na sessions, nie meetings. Jedno meeting może mieć wiele runtime
  -- sesji — wystarczy 'joined' w dowolnej.
  SELECT EXISTS (
    SELECT 1
      FROM public.htg_meeting_participants p
      JOIN public.htg_meeting_sessions s ON s.id = p.session_id
     WHERE s.meeting_id = p_meeting_id
       AND p.user_id = p_user_id
       AND p.status = 'joined'
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    v_missing := v_missing || ARRAY['not_participant']::TEXT[];
  END IF;

  RETURN QUERY SELECT (array_length(v_missing, 1) IS NULL) AS passed, v_missing;
END
$$;

REVOKE EXECUTE ON FUNCTION public.check_processing_export_consent_meeting(UUID, UUID, BOOLEAN) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_processing_export_consent_meeting(UUID, UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.check_processing_export_consent_meeting(UUID, UUID, BOOLEAN) IS
  'Meeting-level consent gate dla UC1 (group enrichment) w processing service. '
  'AND: globalne gate''y + participation w meeting. NIE sprawdza capture — to jest '
  'per booking i walidowane osobno w handlerze eksportu przy budowaniu bookings_used[]. '
  'Phase 1 MVP: p_require_sensitive zawsze TRUE (jednolita polityka art. 9 §9). '
  'Patrz: docs/processing-service-plan.md §3.1 punkt 5 (UC1 meeting-level)';
