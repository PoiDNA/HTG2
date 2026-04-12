-- Migration 072: Add natalia_interpreter session type, interpreter_locale
-- on bookings, and JSONB i18n columns on content tables.
-- ===================================================================

-- ─── 1. Extend booking_slots session_type CHECK for natalia_interpreter ──

ALTER TABLE public.booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_session_type_check;

ALTER TABLE public.booking_slots
  ADD CONSTRAINT booking_slots_session_type_check
  CHECK (session_type IN (
    'natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_przemek',
    'pre_session', 'natalia_para', 'natalia_asysta', 'natalia_interpreter'
  ));

-- ─── 2. Add interpreter_locale to bookings ──────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS interpreter_locale TEXT;

-- ─── 3. JSONB i18n columns on content tables ────────────────────────────

-- monthly_sets: localized title and description
ALTER TABLE public.monthly_sets
  ADD COLUMN IF NOT EXISTS title_i18n JSONB DEFAULT '{}';
ALTER TABLE public.monthly_sets
  ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}';

-- products: localized name and description
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_i18n JSONB DEFAULT '{}';
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}';

-- session_templates: localized title and description
ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS title_i18n JSONB DEFAULT '{}';
ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}';
