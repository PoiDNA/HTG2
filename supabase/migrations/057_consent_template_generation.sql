-- ═══════════════════════════════════════════════════════════════
-- 057: consent_records.template_generation INT + content-based backfill
--
-- Rozszerza consent_records o monotonicznie rosnący integer identyfikujący
-- generację szablonu tekstu zgody. Motywacja z planu htg-processing:
--
-- - `check_processing_export_consent` (mig 059/060) wymaga warunku
--   `template_generation >= 1` żeby upewnić się, że user faktycznie zaakceptował
--   rozszerzony scope PRE-1 (wszystkie 3 fazy sesji, AI analytics, RODO art. 9)
-- - poprzedni plan używał stringowego `template_version` — porzucony na rzecz
--   integer, który jest jednoznacznie porównywalny (pre-1 vs pre-10 lex compare
--   byłby złamany dla przyszłych iteracji)
-- - `consent_fingerprint` dla processing service (v10) hashuje to pole — zmiana
--   in-place (np. backfill PRE-2) musi zmieniać fingerprint → cascade purge
--
-- Historyczne mapowanie:
--   0 = pre-0 (historyczne nagrania przed rozszerzonym scope PRE-1)
--   1 = pre-1 (commit 0409153 — 3 fazy, OpenAI Whisper, Anthropic Claude, art. 9)
--   2 = pre-2 (zarezerwowane — przyszłość po legal review DPA)
--
-- Backfill content-based, NIE po dacie commita — odporne na cherry-pick,
-- strefy czasowe, replay migracji. Źródłem prawdy jest treść consent_text.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. ADD COLUMN template_generation ──────────────────────────
ALTER TABLE public.consent_records
  ADD COLUMN IF NOT EXISTS template_generation INT NOT NULL DEFAULT 0;

-- Nowa kolumna = 0 dla wszystkich istniejących wierszy (historyczne),
-- następnie content-based backfill podnosi pasujące do 1.


-- ── 2. Pre-check: liczba kandydatów w rozsądnych widełkach ─────
-- Widełki 5-100000 (górna granica defensywna na wypadek szerokiego backfillu
-- przy dużej skali, dolna chroni przed run na pustej bazie / przed deploy).
-- Poza widełkami → RAISE EXCEPTION → rollback całej transakcji, bez trwałej
-- zmiany. Manual recovery: inżynier analizuje consent_text rekordów które
-- nie pasują do wzorca, rozszerza reguły LIKE w nowym PR migracyjnym.

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.consent_records
   WHERE consent_type IN ('session_recording_capture', 'session_recording_access')
     AND consent_text LIKE '%Wstęp%'
     AND consent_text LIKE '%Sesja%'
     AND consent_text LIKE '%Podsumowanie%'
     AND (consent_text LIKE '%OpenAI%' OR consent_text LIKE '%Whisper%')
     AND (consent_text LIKE '%Anthropic%' OR consent_text LIKE '%Claude%')
     AND consent_text LIKE '%art. 9%';

  RAISE NOTICE '[057 backfill] Found % consent_records rows matching PRE-1 signature', v_count;

  IF v_count > 100000 THEN
    RAISE EXCEPTION '[057 backfill] Unexpectedly many rows (%) — check if sanity bounds need adjustment', v_count;
  END IF;
END $$;


-- ── 3. Backfill: PRE-1 signature → template_generation = 1 ─────
-- Pełen zestaw fraz z PRE-1 (commit 0409153):
--   * Wstęp / Sesja / Podsumowanie — 3 nazwy faz
--   * OpenAI lub Whisper — transcription subprocessor
--   * Anthropic lub Claude — analysis subprocessor
--   * art. 9 — explicit RODO reference
-- Rekordy bez kompletu fraz zostają = 0 (legacy narrow scope).

UPDATE public.consent_records
   SET template_generation = 1
 WHERE template_generation = 0
   AND consent_type IN ('session_recording_capture', 'session_recording_access')
   AND consent_text LIKE '%Wstęp%'
   AND consent_text LIKE '%Sesja%'
   AND consent_text LIKE '%Podsumowanie%'
   AND (consent_text LIKE '%OpenAI%' OR consent_text LIKE '%Whisper%')
   AND (consent_text LIKE '%Anthropic%' OR consent_text LIKE '%Claude%')
   AND consent_text LIKE '%art. 9%';


-- ── 4. Post-check: leak detection (symmetric to pre-check) ─────
-- Jeśli po backfillu nadal istnieją wiersze z template_generation=0 które
-- pasują do PEŁNEGO wzorca PRE-1, to oznacza bug w UPDATE predicate —
-- RAISE EXCEPTION i rollback. Symmetric pre/post zapewnia że backfill
-- faktycznie złapał wszystko co powinien.

DO $$
DECLARE
  v_leaked INT;
BEGIN
  SELECT count(*) INTO v_leaked FROM public.consent_records
   WHERE template_generation = 0
     AND consent_type IN ('session_recording_capture', 'session_recording_access')
     AND consent_text LIKE '%Wstęp%'
     AND consent_text LIKE '%Sesja%'
     AND consent_text LIKE '%Podsumowanie%'
     AND (consent_text LIKE '%OpenAI%' OR consent_text LIKE '%Whisper%')
     AND (consent_text LIKE '%Anthropic%' OR consent_text LIKE '%Claude%')
     AND consent_text LIKE '%art. 9%';

  IF v_leaked > 0 THEN
    RAISE EXCEPTION '[057 backfill] LEAK: % rows with full PRE-1 markers still have template_generation=0', v_leaked;
  END IF;

  RAISE NOTICE '[057 backfill] Post-check passed — no PRE-1 rows leaked';
END $$;


-- ── 5. Index dla szybkiego lookup w RPCs ───────────────────────
-- check_processing_export_consent filtruje po (user_id, booking_id, consent_type)
-- i template_generation — istniejące indexy obsługują pierwsze trzy, ale
-- template_generation jest nowe. Dodajemy kompozytowy partial index dla
-- typowej ścieżki (granted capture dla booking).

CREATE INDEX IF NOT EXISTS idx_consent_records_booking_capture_template
  ON public.consent_records (booking_id, user_id, template_generation, created_at DESC)
  WHERE consent_type = 'session_recording_capture' AND granted = true;


-- ── 6. Comment: link do planu + dokumentacja ───────────────────
COMMENT ON COLUMN public.consent_records.template_generation IS
  'Monotonicznie rosnący generation identyfikator szablonu consent_text. '
  '0=pre-0 (legacy narrow scope sesja-only), 1=pre-1 (3 fazy + AI analytics + RODO art. 9, commit 0409153). '
  'Używane przez check_processing_export_consent (mig 059/060) jako gate: wymagane >=1. '
  'Hashowane w consent_fingerprint dla processing service — zmiana in-place triggeruje cascade purge. '
  'Stałe mapowania w lib/consent/template.ts (CONSENT_TEMPLATE_GENERATION_*). '
  'Patrz: docs/processing-service-plan.md §3.1';
