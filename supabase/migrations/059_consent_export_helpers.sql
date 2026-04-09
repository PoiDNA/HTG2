-- ═══════════════════════════════════════════════════════════════
-- 059: Helper RPCs dla processing service consent gate
--
-- Tworzy 3 wewnętrzne helpery używane przez check_processing_export_consent
-- (mig 060, booking-level UC2) oraz check_processing_export_consent_meeting
-- (mig 061, meeting-level UC1):
--
-- 1. consent_current(user_id, type)
--    — zwraca najnowszy wiersz consent_records dla danej pary, deterministyczny
--      tie-break przez (created_at DESC, id DESC). Append-only model wycofań:
--      najnowszy wiersz z granted=false oznacza wycofanie.
--
-- 2. _consent_capture_count_ok(booking_id)
--    — sprawdza czy liczba distinct userów z granted capture dla danego booking
--      jest >= wymagania (1 dla solo, 2 dla natalia_para). Replikuje semantykę
--      istniejącego check_analytics_consent (mig 051) ale jako helper — stary
--      RPC NIE jest modyfikowany (używany przez lib/client-analysis pipeline).
--
-- 3. _user_export_consent_ok(user_id, require_sensitive)
--    — sprawdza TYLKO globalne gate'y (sensitive_data, feature flags). NIE
--      sprawdza booking-scoped capture ani template_generation — to walidowane
--      osobno per booking w handlerze eksportu i booking-level RPC.
--
-- Wszystkie są SECURITY DEFINER + explicit search_path (ochrona przed schema
-- injection) + REVOKE dla authenticated (tylko service_role).
--
-- Patrz: docs/processing-service-plan.md §3.1
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- 1. consent_current — najnowszy wiersz per (user, type)
-- ═══════════════════════════════════════════════════════════════
-- Append-only model: każdy nowy wiersz z granted=true/false zastępuje stan
-- poprzedni. "Obowiązujący stan zgody" = ostatni wiersz per (user, type).
-- Tie-break przez id DESC chroni przed niedeterministyką gdy dwa wiersze
-- mają identyczne created_at (race przy equal timestamps).

CREATE OR REPLACE FUNCTION public.consent_current(
  p_user_id UUID,
  p_consent_type TEXT
)
RETURNS public.consent_records
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
    FROM public.consent_records
   WHERE user_id = p_user_id
     AND consent_type = p_consent_type
   ORDER BY created_at DESC, id DESC
   LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.consent_current(UUID, TEXT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.consent_current(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.consent_current(UUID, TEXT) IS
  'Zwraca najnowszy wiersz consent_records dla (user, type) z deterministycznym '
  'tie-break. Append-only wycofanie: ostatni wiersz z granted=false = wycofane. '
  'STABLE semantyka zapewnia spójność w ramach jednej transakcji. '
  'Patrz: docs/processing-service-plan.md §3.1 punkt 2';


-- ═══════════════════════════════════════════════════════════════
-- 2. _consent_capture_count_ok — booking-level capture count check
-- ═══════════════════════════════════════════════════════════════
-- Replikuje semantykę check_analytics_consent (mig 051 linia 74-99):
--   * natalia_para wymaga 2 distinct userów z granted=true
--   * pozostałe typy wymagają 1
-- Używane jako jeden z warunków AND w check_processing_export_consent (mig 060).
-- Stary check_analytics_consent pozostaje nietknięty (używany przez
-- lib/client-analysis/* pipeline). Wspólnym helperem zapobiegamy semantic drift:
-- jeśli kiedykolwiek zmienimy liczby dla natalia_para, oba RPC się dostosują.

CREATE OR REPLACE FUNCTION public._consent_capture_count_ok(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking       public.bookings%ROWTYPE;
  v_required      INT;
  v_capture_count INT;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking IS NULL THEN RETURN false; END IF;

  -- natalia_para wymaga 2 consents (spójne z mig 036 + mig 051)
  v_required := CASE WHEN v_booking.session_type = 'natalia_para' THEN 2 ELSE 1 END;

  SELECT count(DISTINCT user_id) INTO v_capture_count
    FROM public.consent_records
   WHERE booking_id = p_booking_id
     AND consent_type = 'session_recording_capture'
     AND granted = true;

  RETURN v_capture_count >= v_required;
END
$$;

REVOKE EXECUTE ON FUNCTION public._consent_capture_count_ok(UUID) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public._consent_capture_count_ok(UUID) TO service_role;

COMMENT ON FUNCTION public._consent_capture_count_ok(UUID) IS
  'Booking-level count check: czy liczba distinct granted capture >= wymagania. '
  'Replikuje semantykę check_analytics_consent (mig 051). natalia_para=2, solo=1. '
  'Używane przez check_processing_export_consent jako część AND. Stary RPC nietknięty. '
  'Patrz: docs/processing-service-plan.md §3.1 punkt 4';


-- ═══════════════════════════════════════════════════════════════
-- 3. _user_export_consent_ok — tylko globalne gate'y
-- ═══════════════════════════════════════════════════════════════
-- Sprawdza globalne warunki które muszą być spełnione niezależnie od bookingu:
--   * sensitive_data consent (wymagane dla art. 9 compliance — jednolita
--     polityka §9, cały eksport obejmuje dane wrażliwe)
--   * app_settings.client_analytics_enabled (istniejący pipeline insights)
--   * app_settings.processing_export_enabled (nowy gate dla htg-processing)
--
-- NIE sprawdza session_recording_capture ani template_generation — capture
-- jest booking-scoped i walidowany osobno per booking w handlerze eksportu
-- (dla batch UC1) lub w booking-level RPC (dla UC2). Plan §3.1 punkt 4.
--
-- Zwraca (passed BOOLEAN, missing TEXT[]) dla endpointu — dzięki liście
-- brakujących gate'ów handler może zwrócić konkretny 409 z missing types.

CREATE OR REPLACE FUNCTION public._user_export_consent_ok(
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
  v_missing       TEXT[] := ARRAY[]::TEXT[];
  v_sensitive     public.consent_records%ROWTYPE;
  v_analytics_on  BOOLEAN;
  v_processing_on BOOLEAN;
BEGIN
  -- Check 1: sensitive_data consent (jeśli wymagane)
  IF p_require_sensitive THEN
    v_sensitive := public.consent_current(p_user_id, 'sensitive_data');
    IF v_sensitive.id IS NULL OR v_sensitive.granted IS DISTINCT FROM true THEN
      v_missing := v_missing || ARRAY['sensitive_data']::TEXT[];
    END IF;
  END IF;

  -- Check 2: client_analytics_enabled flag
  v_analytics_on := public.app_setting_bool('client_analytics_enabled');
  IF v_analytics_on IS DISTINCT FROM true THEN
    v_missing := v_missing || ARRAY['client_analytics_disabled']::TEXT[];
  END IF;

  -- Check 3: processing_export_enabled flag
  v_processing_on := public.app_setting_bool('processing_export_enabled');
  IF v_processing_on IS DISTINCT FROM true THEN
    v_missing := v_missing || ARRAY['processing_export_disabled']::TEXT[];
  END IF;

  RETURN QUERY SELECT (array_length(v_missing, 1) IS NULL) AS passed, v_missing;
END
$$;

REVOKE EXECUTE ON FUNCTION public._user_export_consent_ok(UUID, BOOLEAN) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public._user_export_consent_ok(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public._user_export_consent_ok(UUID, BOOLEAN) IS
  'Globalne gate''y dla processing service export: sensitive_data (art. 9) + feature flags. '
  'NIE sprawdza capture/template_generation — te są booking-scoped i walidowane osobno. '
  'Zwraca (passed, missing[]) — missing lista kodów: sensitive_data, client_analytics_disabled, '
  'processing_export_disabled. Handler eksportu mapuje na 409 response. '
  'Patrz: docs/processing-service-plan.md §3.1 punkt 4';
