-- Migration 093: Fragment tags + editor write access
-- =====================================================================
-- Dodaje tagi do session_fragments do filtrowania w /momenty oraz
-- poszerza zapis o rolę 'editor' (dotychczas wyłącznie service_role).
--
-- Tagi są denormalizowane jako text[] + GIN index. Lista tagów jest
-- trzymana w kodzie (lib/constants/fragment-tags.ts) — dopóki nie
-- przekroczy ~20 pozycji. Wtedy migracja normalizuje do tabeli.

ALTER TABLE public.session_fragments
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_session_fragments_tags
  ON public.session_fragments USING gin(tags);

COMMENT ON COLUMN public.session_fragments.tags IS
  'Tagi kategorii (np. relacje, lęk, ciało). Lista allowed values w lib/constants/fragment-tags.ts. Walidowane po stronie API — bez CHECK w DB aby uniknąć częstych migracji.';
