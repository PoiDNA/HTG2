-- Migration 074: Translators as staff members + interpreter session variants
-- =============================================================================
-- Part 1: staff_members extended with role='translator' + locale column
-- Part 2: booking_slots gets translator_id FK
-- Part 3: 3 new session types for interpreter variants (solo/asysta/para, 180 min)
-- Part 4: acceleration_queue prepared with interpreter_locale (iteration 2)
-- Part 5: seed 3 translators (Melania EN, Bernadetta DE, Edyta PT)
-- No new RLS policies: translator writes via service-role through requireStaff.

-- ─── 1. Extend staff_members.role CHECK + add locale column ──────────────────

ALTER TABLE public.staff_members
  DROP CONSTRAINT IF EXISTS staff_members_role_check;

ALTER TABLE public.staff_members
  ADD CONSTRAINT staff_members_role_check
  CHECK (role IN ('practitioner', 'assistant', 'translator'));

ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS locale TEXT;

-- NULL for practitioner/assistant; one of ('en','de','pt') for translator
ALTER TABLE public.staff_members
  DROP CONSTRAINT IF EXISTS staff_members_locale_check;

ALTER TABLE public.staff_members
  ADD CONSTRAINT staff_members_locale_check
  CHECK (
    (role IN ('practitioner', 'assistant') AND locale IS NULL)
    OR
    (role = 'translator' AND locale IN ('en', 'de', 'pt'))
  );

-- ─── 2. Extend booking_slots.session_type CHECK with 3 interpreter variants ──

ALTER TABLE public.booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_session_type_check;

ALTER TABLE public.booking_slots
  ADD CONSTRAINT booking_slots_session_type_check
  CHECK (session_type IN (
    'natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_przemek',
    'pre_session', 'natalia_para', 'natalia_asysta',
    'natalia_interpreter',          -- deprecated legacy (120 min)
    'natalia_interpreter_solo',     -- new (180 min)
    'natalia_interpreter_asysta',   -- new (180 min, assistant_id required)
    'natalia_interpreter_para'      -- new (180 min, maxClients=2)
  ));

-- Note: bookings.session_type has no CHECK (verified in 003_booking_system.sql:108),
-- so no constraint update needed there.

-- ─── 3. Add translator_id FK to booking_slots ────────────────────────────────

ALTER TABLE public.booking_slots
  ADD COLUMN IF NOT EXISTS translator_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_slots_translator ON public.booking_slots(translator_id, slot_date)
  WHERE translator_id IS NOT NULL;

-- ─── 4. Prepare acceleration_queue for interpreter (iteration 2) ─────────────

ALTER TABLE public.acceleration_queue
  ADD COLUMN IF NOT EXISTS interpreter_locale TEXT;

-- ─── 5. Seed 3 translators ───────────────────────────────────────────────────
-- INSERT ... ON CONFLICT DO NOTHING — safe if user_id lookup fails
-- (auth.users row may not exist yet; link later via trigger on profile)

INSERT INTO public.staff_members (name, slug, role, session_types, email, locale, is_active, user_id)
VALUES
  (
    'Melania', 'melania', 'translator',
    ARRAY['natalia_interpreter_solo', 'natalia_interpreter_asysta', 'natalia_interpreter_para'],
    'melania@htg.cyou', 'en', true,
    (SELECT id FROM auth.users WHERE email = 'melania@htg.cyou' LIMIT 1)
  ),
  (
    'Bernadetta', 'bernadetta', 'translator',
    ARRAY['natalia_interpreter_solo', 'natalia_interpreter_asysta', 'natalia_interpreter_para'],
    'bernadetta@htg.cyou', 'de', true,
    (SELECT id FROM auth.users WHERE email = 'bernadetta@htg.cyou' LIMIT 1)
  ),
  (
    'Edyta', 'edytap', 'translator',
    ARRAY['natalia_interpreter_solo', 'natalia_interpreter_asysta', 'natalia_interpreter_para'],
    'edytap@htg.cyou', 'pt', true,
    (SELECT id FROM auth.users WHERE email = 'edytap@htg.cyou' LIMIT 1)
  )
ON CONFLICT (slug) DO UPDATE SET
  role = EXCLUDED.role,
  session_types = EXCLUDED.session_types,
  email = EXCLUDED.email,
  locale = EXCLUDED.locale,
  is_active = EXCLUDED.is_active,
  user_id = COALESCE(public.staff_members.user_id, EXCLUDED.user_id);

-- Backfill user_id later if it was NULL at seed time
UPDATE public.staff_members sm
SET user_id = u.id
FROM auth.users u
WHERE sm.role = 'translator'
  AND sm.user_id IS NULL
  AND sm.email IS NOT NULL
  AND LOWER(u.email) = LOWER(sm.email);
