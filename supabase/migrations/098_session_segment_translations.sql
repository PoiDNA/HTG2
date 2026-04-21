-- Migration 098: Tłumaczenia segmentów transkrypcji (EN/DE/PT)
-- ============================================================
-- Dodaje `text_i18n jsonb` na session_speaker_segments analogicznie do
-- title_i18n/description_i18n na session_fragments. Oryginał (PL) pozostaje
-- w kolumnie `text` jako source of truth; tłumaczenia Claude + ręczne korekty
-- Tłumaczy trafiają pod odpowiedni klucz locale w `text_i18n`.
--
-- Kształt `text_i18n`:
--   { "en": "…", "de": "…", "pt": "…" }
-- Klucze opcjonalne — brak tłumaczenia = brak klucza. Konsument na stronie
-- sesji powinien fallback-ować na `text` (PL) gdy locale nieobecny.

ALTER TABLE public.session_speaker_segments
  ADD COLUMN IF NOT EXISTS text_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.session_speaker_segments.text_i18n IS
  'Tłumaczenia tekstu segmentu per locale: {"en": "...", "de": "...", "pt": "..."}. Oryginał (PL) w kolumnie `text`. Generowane przez Claude (/translate) i korygowane przez Tłumaczy.';
