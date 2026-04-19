-- ─────────────────────────────────────────────────────────────────────────────
-- 097 — Słowo: admin-curated "Word" fragments
-- ─────────────────────────────────────────────────────────────────────────────
-- Staff oznacza wybrane fragmenty jako is_slowo=true. Widoczne dla każdego
-- zalogowanego usera jako kategoria "📖 Słowo" w Momentach i Radio.
-- Playback przez PATH B w fragment-token (jak is_impulse).

ALTER TABLE public.session_fragments
  ADD COLUMN IF NOT EXISTS is_slowo BOOLEAN NOT NULL DEFAULT false;

-- Index na partial table dla szybkich zapytań przez API
CREATE INDEX IF NOT EXISTS idx_session_fragments_slowo
  ON public.session_fragments(session_template_id, ordinal)
  WHERE is_slowo = true;
