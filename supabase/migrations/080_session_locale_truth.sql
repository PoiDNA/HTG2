-- Migration 080: booking_slots jako jedyne źródło prawdy dla języka i blokady tłumacza
-- =====================================================================================
-- Kontekst: po migracji z WIX (wszystkie PL) + wielojęzyczny model (EN/DE/PT) mamy
-- rozproszone dane o języku sesji (translator_id → staff.locale, bookings.interpreter_locale,
-- domyślnie PL). Dodajemy dwie kolumny na booking_slots, backfill historii, enforcement.
--
-- Zmiany:
--   1. booking_slots.locale (pl|en|de|pt) — jawny język sesji
--   2. booking_slots.translator_locked (bool) — true = tłumacz NIE może podpiąć tego slotu
--
-- Backfill (Próg 2 — konsensualny):
--   locale:
--     - translator_id IS NOT NULL → staff_members.locale (en/de/pt)
--     - bookings.interpreter_locale obecne → ta wartość
--     - session_type LIKE 'natalia_interpreter%' bez wskazówki → 'en' (historyczny fallback)
--     - reszta → 'pl'
--   translator_locked = TRUE dla:
--     - import_key IS NOT NULL (WIX imports, wszystkie PL, zamknięte dla tłumaczy)
--     - status IN ('booked','completed') AND translator_id IS NULL AND locale='pl'
--       (historyczne PL sesje — nie można ich już podpiąć, i tak są zajęte)
--
-- Co zostaje nietknięte:
--   - bookings.interpreter_locale — dalej zapisywany przez reserve_slot (migr. 076)
--   - Wszystkie istniejące rezerwacje (status=booked/completed/held) nie zmieniają statusu,
--     tylko zyskują dwa nowe pola opisowe.

-- ─── 1. Dodaj kolumny (nullable na czas backfill) ───────────────────────────

ALTER TABLE public.booking_slots
  ADD COLUMN IF NOT EXISTS locale TEXT;

ALTER TABLE public.booking_slots
  ADD COLUMN IF NOT EXISTS translator_locked BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. Backfill locale: translator_id → staff_members.locale ───────────────

UPDATE public.booking_slots bs
SET locale = sm.locale
FROM public.staff_members sm
WHERE bs.translator_id = sm.id
  AND bs.locale IS NULL
  AND sm.locale IN ('en', 'de', 'pt');

-- ─── 3. Backfill locale: bookings.interpreter_locale (ostatnie niecancelled) ─

UPDATE public.booking_slots bs
SET locale = b.interpreter_locale
FROM public.bookings b
WHERE b.slot_id = bs.id
  AND bs.locale IS NULL
  AND b.interpreter_locale IN ('en', 'de', 'pt')
  AND b.status <> 'cancelled';

-- ─── 4. Backfill locale: interpreter session_type bez tłumacza → 'en' ───────
--     (edge case: sloty z natalia_interpreter_* bez wpisanego translator_id
--      i bez bookings.interpreter_locale; historyczny default)

UPDATE public.booking_slots
SET locale = 'en'
WHERE locale IS NULL
  AND session_type LIKE 'natalia_interpreter%';

-- ─── 5. Backfill locale: reszta → 'pl' ──────────────────────────────────────

UPDATE public.booking_slots
SET locale = 'pl'
WHERE locale IS NULL;

-- ─── 6. Backfill translator_locked — Próg 2 ─────────────────────────────────
--     6a. Wszystkie WIX-owe (import_key IS NOT NULL) — historycznie PL, zamknięte

UPDATE public.booking_slots
SET translator_locked = true
WHERE import_key IS NOT NULL
  AND locale = 'pl';

--     6b. Historyczne PL booked/completed bez tłumacza — i tak zajęte,
--         bezpieczny kosmetyczny znacznik (chroni przed przyszłym join-em)

UPDATE public.booking_slots
SET translator_locked = true
WHERE status IN ('booked', 'completed')
  AND translator_id IS NULL
  AND locale = 'pl'
  AND session_type NOT LIKE 'natalia_interpreter%';

-- ─── 7. Enforcement: NOT NULL + DEFAULT 'pl' + CHECK constraints ──────────
-- DEFAULT 'pl' chroni legacy-writerów (np. skrypty importu WIX, które nie wiedzą
-- o nowej kolumnie); wszystkie nowe ścieżki aplikacji jawnie ustawiają locale.

ALTER TABLE public.booking_slots
  ALTER COLUMN locale SET DEFAULT 'pl';

ALTER TABLE public.booking_slots
  ALTER COLUMN locale SET NOT NULL;

ALTER TABLE public.booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_locale_check;

ALTER TABLE public.booking_slots
  ADD CONSTRAINT booking_slots_locale_check
  CHECK (locale IN ('pl', 'en', 'de', 'pt'));

-- translator_locked ma sens tylko dla PL bez przypisanego tłumacza.
-- (Gdyby ktoś przypisał tłumacza do slotu z translator_locked=true, to nonsens
--  — lock oznacza "tłumacz nie może podpiąć", a tu już jest podpięty.)
ALTER TABLE public.booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_translator_lock_check;

ALTER TABLE public.booking_slots
  ADD CONSTRAINT booking_slots_translator_lock_check
  CHECK (
    translator_locked = false
    OR (translator_id IS NULL AND locale = 'pl')
  );

-- Spójność: translator_id + locale muszą się zgadzać na żywych slotach.
-- Enforce przez FK-like trigger zamiast CHECK (bo CHECK nie może odwołać się do innej tabeli).
-- Zamiast triggera — polegamy na tym, że RPC `reserve_slot` (migr. 076) derive locale z translatora.
-- Ten komentarz służy jako zapis: spójność pilnowana na poziomie aplikacji, nie constraint.

-- ─── 8. Indeksy ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_booking_slots_locale_available
  ON public.booking_slots (locale, slot_date)
  WHERE status = 'available';

CREATE INDEX IF NOT EXISTS idx_booking_slots_translator_lock
  ON public.booking_slots (translator_locked)
  WHERE status = 'available' AND translator_locked = true;

-- ─── 9. Komentarze ──────────────────────────────────────────────────────────

COMMENT ON COLUMN public.booking_slots.locale IS
  'Jawny język sesji: pl | en | de | pt. Jedyne źródło prawdy (nie derive z translator_id).';

COMMENT ON COLUMN public.booking_slots.translator_locked IS
  'true = tłumacz NIE może podpiąć tego slotu jako natalia_interpreter_*. '
  'Ustawiane dla: (a) migracji z WIX (import_key), (b) historycznych PL sesji booked/completed. '
  'Nowe sloty tworzone przez Natalię mają locked=false domyślnie.';
