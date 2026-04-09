-- ═══════════════════════════════════════════════════════════════
-- 060: check_processing_export_consent (booking-level, UC2)
--
-- Booking-level consent gate dla eksportu dossier UC2 (Mapa Uwarunkowań).
-- Łączy 3 warunki AND:
--
-- 1. _consent_capture_count_ok(booking_id)
--    — wystarczająca liczba distinct granted capture (1 dla solo, 2 natalia_para)
--
-- 2. _user_export_consent_ok(user_id, require_sensitive)
--    — globalne gate'y: sensitive_data + feature flags (client_analytics_enabled,
--      processing_export_enabled)
--
-- 3. Per-user-per-booking inline consent_current + template_generation check
--    — user musi mieć NAJNOWSZY wiersz consent dla tego bookingu z granted=true
--      i template_generation >= 1. Scope booking-specific (nie globalny per user)
--      bo session_recording_capture jest per booking — natalia_para może mieć
--      różne statusy consent dla różnych bookingów.
--
-- Dla natalia_para: drugi uczestnik pary NIE jest w bookings.user_id (to tylko
-- główny bookujący). Źródłem prawdy o "user brał udział w bookingu" są wiersze
-- w consent_records z booking_id — nie bookings.user_id. Walidacja per user
-- poprzez EXISTS na consent_records.
--
-- Zwraca (passed BOOLEAN, missing TEXT[]) — handler mapuje missing na 409.
-- Kody missing:
--   * capture_count_insufficient — za mało granted capture dla tego bookingu
--   * sensitive_data | client_analytics_disabled | processing_export_disabled
--     (z _user_export_consent_ok)
--   * capture_not_granted — brak granted capture dla tej pary user+booking
--   * template_too_old — capture istnieje ale template_generation < 1
--
-- Patrz: docs/processing-service-plan.md §3.1 punkt 5
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_processing_export_consent(
  p_booking_id UUID,
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
  v_capture_ok      BOOLEAN;
  v_global_passed   BOOLEAN;
  v_global_missing  TEXT[];
  v_per_booking_row public.consent_records%ROWTYPE;
BEGIN
  -- ── Check 1: booking-level capture count ok ─────────────────
  v_capture_ok := public._consent_capture_count_ok(p_booking_id);
  IF NOT v_capture_ok THEN
    v_missing := v_missing || ARRAY['capture_count_insufficient']::TEXT[];
  END IF;

  -- ── Check 2: globalne gate'y (sensitive + feature flags) ────
  SELECT g.passed, g.missing INTO v_global_passed, v_global_missing
    FROM public._user_export_consent_ok(p_user_id, p_require_sensitive) g;
  IF NOT v_global_passed THEN
    v_missing := v_missing || v_global_missing;
  END IF;

  -- ── Check 3: per-(user, booking) najnowszy wiersz capture ──
  -- Inline "consent_current per tuple" — consent_current(user, type) działa
  -- globalnie per user+type, a dla natalia_para ten sam user może mieć zgody
  -- dla różnych bookingów z różnymi statusami. Potrzebujemy najnowszy wiersz
  -- dla tego KONKRETNEGO (user, booking, type).
  SELECT * INTO v_per_booking_row
    FROM public.consent_records
   WHERE user_id = p_user_id
     AND booking_id = p_booking_id
     AND consent_type = 'session_recording_capture'
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  IF v_per_booking_row.id IS NULL THEN
    v_missing := v_missing || ARRAY['capture_not_granted']::TEXT[];
  ELSIF v_per_booking_row.granted IS DISTINCT FROM true THEN
    -- Najnowszy wiersz to wycofanie
    v_missing := v_missing || ARRAY['capture_not_granted']::TEXT[];
  ELSIF v_per_booking_row.template_generation < 1 THEN
    v_missing := v_missing || ARRAY['template_too_old']::TEXT[];
  END IF;

  RETURN QUERY SELECT (array_length(v_missing, 1) IS NULL) AS passed, v_missing;
END
$$;

REVOKE EXECUTE ON FUNCTION public.check_processing_export_consent(UUID, UUID, BOOLEAN) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_processing_export_consent(UUID, UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.check_processing_export_consent(UUID, UUID, BOOLEAN) IS
  'Booking-level consent gate dla UC2 (Mapa Uwarunkowań) w processing service. '
  'AND 3 checki: booking-level capture count + globalne gate''y + per-(user,booking,type) '
  'inline consent_current z template_generation >= 1. Zachowuje semantykę natalia_para '
  '(drugi uczestnik w consent_records, nie bookings.user_id). '
  'Phase 1 MVP: p_require_sensitive zawsze TRUE (jednolita polityka art. 9 §9). '
  'Patrz: docs/processing-service-plan.md §3.1 punkt 5';


-- ═══════════════════════════════════════════════════════════════
-- Invariant danych: natalia_para musi mieć wiersze consent_records
-- dla OBYDWU userów z tym samym booking_id
-- ═══════════════════════════════════════════════════════════════
-- Bez tego invariantu RPC może fałszywie przepuścić natalia_para (jeden user
-- ma granted capture, drugi brak wiersza → count_ok=false ale per-booking
-- check dla pierwszego user passes). Test integracyjny w lib/__tests__/
-- powinien pokrywać ten scenariusz (dodany w PR CI).
--
-- Na poziomie schematu NIE wymuszamy hard constraint (byłoby zbyt restrykcyjne
-- dla legacy bookingów + skomplikowany trigger). Polegamy na:
--   1. Aplikacja (app/api/live/consent/route.ts) zapisuje consent dla obu
--      uczestników pary
--   2. Check istnieje w helperze _consent_capture_count_ok (count distinct >= 2)
--   3. Test integracyjny weryfikuje że booking natalia_para + tylko 1 consent
--      → check_processing_export_consent zwraca passed=false
