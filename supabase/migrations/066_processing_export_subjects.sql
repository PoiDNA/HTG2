-- ═══════════════════════════════════════════════════════════════
-- 066: processing_export_subjects + processing_export_subject_bookings
--
-- Trwały rejestr autoryzacji scope dla consent-fingerprints endpoint.
-- Poprzednie iteracje planu używały processing_export_audit jako źródła
-- scope, ale audit jest kruchy: retention job, ETL error, lub migracja
-- mogłyby wyciąć wiersze powodując że reconcile dostaje null dla legalnych
-- userów i worker purge'uje poprawne cache.
--
-- V10+: dedykowana tabela trwała (bez retention) jako whitelist autoryzacji
-- przez service_id (derivowany z HMAC KID). Audit log (mig 067) zostaje,
-- ale tylko do raportów DPO — nie do autoryzacji.
--
-- Dwie tabele:
--
-- 1. processing_export_subjects (service_id, user_id)
--    User-level whitelist — który worker (service_id) ma prawo pytać o
--    którego usera. Jeden wiersz per (service, user) z first/last_seen_at.
--
-- 2. processing_export_subject_bookings (service_id, user_id, booking_id)
--    Booking-level whitelist — subset bookingów które worker eksportował
--    dla tego usera. Scope-keyed auth (v12): consent-fingerprints endpoint
--    może odpowiedzieć tylko na żądania scope ({user_id, bookings_used[]})
--    gdzie wszystkie booking_id z bookings_used są podzbiorem wcześniej
--    eksportowanych. Blokuje sondowanie consent'u arbitralnych bookingów.
--
-- Oba są **append-only na insert, update last_seen_at** (upsert przy każdym
-- udanym eksporcie). Cleanup tylko przy user soft-delete — NIE ma retention,
-- trwają tak długo jak user istnieje w auth.users.
--
-- FK CASCADE dla auth.users delete (hard delete). Soft delete (np. profile.
-- deleted_at) wymaga explicit DELETE w soft-delete handler po stronie HTG2 —
-- to obowiązek aplikacji, nie schema (FK CASCADE nie odpala dla soft delete).
--
-- Patrz: docs/processing-service-plan.md §20.4
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- 1. processing_export_subjects — user-level whitelist
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.processing_export_subjects (
  service_id    TEXT NOT NULL,  -- derived z HMAC KID (mapowanie w handlerze)
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (service_id, user_id)
);

CREATE INDEX IF NOT EXISTS processing_export_subjects_user_idx
  ON public.processing_export_subjects (user_id);

COMMENT ON TABLE public.processing_export_subjects IS
  'Trwały rejestr autoryzacji scope user-level dla consent-fingerprints endpoint. '
  'Upsert (first_seen_at/last_seen_at) przy każdym udanym eksporcie. FK CASCADE '
  'dla auth.users hard delete. Soft delete wymaga explicit DELETE w handlerze. '
  'Patrz: docs/processing-service-plan.md §20.4';


-- ═══════════════════════════════════════════════════════════════
-- 2. processing_export_subject_bookings — booking-level whitelist
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.processing_export_subject_bookings (
  service_id    TEXT NOT NULL,
  user_id       UUID NOT NULL,
  booking_id    UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (service_id, user_id, booking_id),

  -- FK do parent table processing_export_subjects:
  -- jeśli parent (service_id, user_id) jest kasowany, kaskada usuwa wszystkie
  -- booking-level entries dla tej pary.
  FOREIGN KEY (service_id, user_id)
    REFERENCES public.processing_export_subjects(service_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS processing_export_subject_bookings_user_idx
  ON public.processing_export_subject_bookings (user_id);

CREATE INDEX IF NOT EXISTS processing_export_subject_bookings_booking_idx
  ON public.processing_export_subject_bookings (booking_id);

COMMENT ON TABLE public.processing_export_subject_bookings IS
  'Booking-level whitelist dla scope-keyed auth w consent-fingerprints endpoint. '
  'Worker może pytać o fingerprint dla scope z bookings_used[] tylko jeśli '
  'WSZYSTKIE booking_id są podzbiorem tej whitelisty. Blokuje sondowanie '
  'consent''u arbitralnych bookingów. FK cascades z bookings + z parent subjects. '
  'Patrz: docs/processing-service-plan.md §20.4';


-- ═══════════════════════════════════════════════════════════════
-- 3. Helper upsert RPC — używany przez handler eksportu
-- ═══════════════════════════════════════════════════════════════
-- Zamiast dwóch osobnych upsertów w handlerze, jedna RPC która atomowo
-- aktualizuje oba poziomy (parent subjects + booking-level bookings).
-- Handler wywołuje po udanym eksporcie żeby zapisać whitelist entry.

CREATE OR REPLACE FUNCTION public.processing_export_subjects_upsert(
  p_service_id TEXT,
  p_user_id UUID,
  p_booking_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking UUID;
BEGIN
  -- Upsert parent subjects row (user-level)
  INSERT INTO public.processing_export_subjects (service_id, user_id)
  VALUES (p_service_id, p_user_id)
  ON CONFLICT (service_id, user_id) DO UPDATE
    SET last_seen_at = now();

  -- Upsert booking-level rows per booking_id w bookings_used[]
  IF p_booking_ids IS NOT NULL AND array_length(p_booking_ids, 1) > 0 THEN
    FOREACH v_booking IN ARRAY p_booking_ids LOOP
      INSERT INTO public.processing_export_subject_bookings (service_id, user_id, booking_id)
      VALUES (p_service_id, p_user_id, v_booking)
      ON CONFLICT (service_id, user_id, booking_id) DO NOTHING;
    END LOOP;
  END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public.processing_export_subjects_upsert(TEXT, UUID, UUID[]) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.processing_export_subjects_upsert(TEXT, UUID, UUID[]) TO service_role;

COMMENT ON FUNCTION public.processing_export_subjects_upsert(TEXT, UUID, UUID[]) IS
  'Atomowy upsert parent subjects + booking-level entries dla scope-keyed auth. '
  'Wywoływane przez export handler po udanym eksporcie. '
  'Patrz: docs/processing-service-plan.md §20.4';


-- ═══════════════════════════════════════════════════════════════
-- 4. Helper RPC: sprawdzenie czy scope jest autoryzowany
-- ═══════════════════════════════════════════════════════════════
-- Używane przez consent-fingerprints endpoint PRZED zwrotem fingerprintu.
-- Zwraca TRUE jeśli user jest w whitelist i WSZYSTKIE bookings_used są
-- podzbiorem booking-level whitelist dla tego usera.
--
-- Null return dla scope items poza autoryzacją jest **nierozróżnialny**
-- od (a) purgowany scope, (b) user nigdy nie istniał — blokuje enumerację.

CREATE OR REPLACE FUNCTION public.processing_export_scope_authorized(
  p_service_id TEXT,
  p_user_id UUID,
  p_booking_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_exists    BOOLEAN;
  v_missing_count  INT;
BEGIN
  -- 1. User-level check: czy w parent subjects dla tego service_id?
  SELECT EXISTS (
    SELECT 1 FROM public.processing_export_subjects
     WHERE service_id = p_service_id AND user_id = p_user_id
  ) INTO v_user_exists;

  IF NOT v_user_exists THEN
    RETURN false;
  END IF;

  -- 2. Booking-level check: czy WSZYSTKIE p_booking_ids są w booking whitelist?
  -- Jeśli p_booking_ids jest puste → scope-level OK (meeting-only dossier
  -- bez bookingów jest legal case, np. user brał udział w spotkaniach
  -- ale nie ma indywidualnych sesji)
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_missing_count
    FROM unnest(p_booking_ids) AS req_bk
   WHERE NOT EXISTS (
     SELECT 1 FROM public.processing_export_subject_bookings
      WHERE service_id = p_service_id
        AND user_id = p_user_id
        AND booking_id = req_bk
   );

  RETURN v_missing_count = 0;
END
$$;

REVOKE EXECUTE ON FUNCTION public.processing_export_scope_authorized(TEXT, UUID, UUID[]) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.processing_export_scope_authorized(TEXT, UUID, UUID[]) TO service_role;

COMMENT ON FUNCTION public.processing_export_scope_authorized(TEXT, UUID, UUID[]) IS
  'Scope-keyed auth check dla consent-fingerprints. Zwraca true jeśli user '
  'jest w whitelist i WSZYSTKIE bookings_used są podzbiorem booking whitelist. '
  'Używane przed zwrotem fingerprintu — null response nierozróżnialny od '
  'purgowanego/nieistniejącego. Blokuje sondowanie arbitralnych bookingów. '
  'Patrz: docs/processing-service-plan.md §20.4';


-- ═══════════════════════════════════════════════════════════════
-- 5. RLS: service_role only
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.processing_export_subjects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_export_subject_bookings  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'processing_export_subjects'
      AND policyname = 'service_all_processing_export_subjects'
  ) THEN
    CREATE POLICY "service_all_processing_export_subjects" ON public.processing_export_subjects
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'processing_export_subject_bookings'
      AND policyname = 'service_all_processing_export_subject_bookings'
  ) THEN
    CREATE POLICY "service_all_processing_export_subject_bookings" ON public.processing_export_subject_bookings
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
