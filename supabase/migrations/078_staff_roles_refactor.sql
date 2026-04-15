-- Migration 078: Staff roles refactor — operator/editor + pełny skład zespołu
-- =============================================================================
-- 1. Dodaje role 'operator' i 'editor' do CHECK constraint w staff_members
-- 2. Przemianowuje istniejące role 'assistant' → 'operator'
-- 3. Aktualizuje locale CHECK (operator/editor nie mają locale)
-- 4. Upsert pełnego składu zespołu (source of truth: lib/staff-config.ts)
--
-- Zmiany ludzkie:
--   - asystentki (Agata, Justyna, Przemek) → operatorki/operator
--   - edytorki: Marta, Ania (anna@), Dominika (bianka@) — nowe wpisy
--   - tłumacze: dodana Milena EN; Melania oznaczona is_active=false

-- ─── 1. Rozszerz CHECK constraint na role ────────────────────────────────────

ALTER TABLE public.staff_members
  DROP CONSTRAINT IF EXISTS staff_members_role_check;

ALTER TABLE public.staff_members
  ADD CONSTRAINT staff_members_role_check
  CHECK (role IN ('practitioner', 'operator', 'editor', 'translator'));

-- ─── 2. Przemianuj 'assistant' → 'operator' ──────────────────────────────────

UPDATE public.staff_members
SET role = 'operator'
WHERE role = 'assistant';

-- ─── 3. Zaktualizuj locale CHECK ─────────────────────────────────────────────

ALTER TABLE public.staff_members
  DROP CONSTRAINT IF EXISTS staff_members_locale_check;

ALTER TABLE public.staff_members
  ADD CONSTRAINT staff_members_locale_check
  CHECK (
    (role IN ('practitioner', 'operator', 'editor') AND locale IS NULL)
    OR
    (role = 'translator' AND locale IN ('en', 'de', 'pt'))
  );

-- ─── 4. Upsert pełnego składu zespołu ────────────────────────────────────────

-- Prowadząca
INSERT INTO public.staff_members (name, slug, role, session_types, email, is_active, user_id)
VALUES (
  'Natalia', 'natalia', 'practitioner',
  ARRAY['natalia_solo','natalia_agata','natalia_justyna','natalia_przemek','natalia_para','natalia_asysta',
        'natalia_interpreter_solo','natalia_interpreter_asysta','natalia_interpreter_para'],
  'natalia@htg.cyou', true,
  (SELECT id FROM auth.users WHERE email = 'natalia@htg.cyou' LIMIT 1)
)
ON CONFLICT (slug) DO UPDATE SET
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  is_active = EXCLUDED.is_active,
  user_id = COALESCE(public.staff_members.user_id, EXCLUDED.user_id);

-- Operatorki
INSERT INTO public.staff_members (name, slug, role, session_types, email, is_active, user_id)
VALUES
  (
    'Agata', 'agata', 'operator',
    ARRAY['natalia_agata','natalia_asysta'],
    'agata@htg.cyou', true,
    (SELECT id FROM auth.users WHERE email = 'agata@htg.cyou' LIMIT 1)
  ),
  (
    'Justyna', 'justyna', 'operator',
    ARRAY['natalia_justyna','natalia_asysta'],
    'justyna@htg.cyou', true,
    (SELECT id FROM auth.users WHERE email = 'justyna@htg.cyou' LIMIT 1)
  ),
  (
    'Przemek', 'przemek', 'operator',
    ARRAY['natalia_przemek'],
    'przemek@htg.cyou', true,
    (SELECT id FROM auth.users WHERE email = 'przemek@htg.cyou' LIMIT 1)
  )
ON CONFLICT (slug) DO UPDATE SET
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  is_active = EXCLUDED.is_active,
  user_id = COALESCE(public.staff_members.user_id, EXCLUDED.user_id);

-- Edytorki (nowe wpisy)
INSERT INTO public.staff_members (name, slug, role, session_types, email, is_active, user_id)
VALUES
  (
    'Marta', 'marta', 'editor',
    ARRAY[]::text[],
    'marta@htg.cyou', true,
    (SELECT id FROM auth.users WHERE email = 'marta@htg.cyou' LIMIT 1)
  ),
  (
    'Ania', 'ania', 'editor',
    ARRAY[]::text[],
    'anna@htg.cyou', true,
    (SELECT id FROM auth.users WHERE email = 'anna@htg.cyou' LIMIT 1)
  ),
  (
    'Dominika', 'dominika', 'editor',
    ARRAY[]::text[],
    'bianka@htg.cyou', true,
    (SELECT id FROM auth.users WHERE email = 'bianka@htg.cyou' LIMIT 1)
  )
ON CONFLICT (slug) DO UPDATE SET
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  is_active = EXCLUDED.is_active,
  user_id = COALESCE(public.staff_members.user_id, EXCLUDED.user_id);

-- Tłumacze (Milena EN — nowa; Bernadetta DE i Edyta PT — upsertem)
INSERT INTO public.staff_members (name, slug, role, session_types, email, locale, is_active, user_id)
VALUES
  (
    'Milena', 'milena', 'translator',
    ARRAY['natalia_interpreter_solo', 'natalia_interpreter_asysta', 'natalia_interpreter_para'],
    'milena@htg.cyou', 'en', true,
    (SELECT id FROM auth.users WHERE email = 'milena@htg.cyou' LIMIT 1)
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
  email = EXCLUDED.email,
  locale = EXCLUDED.locale,
  is_active = EXCLUDED.is_active,
  user_id = COALESCE(public.staff_members.user_id, EXCLUDED.user_id);

-- Melania (stara tłumaczka EN) → dezaktywacja
UPDATE public.staff_members
SET is_active = false
WHERE slug = 'melania';

-- Backfill user_id dla wszystkich wpisów bez user_id
UPDATE public.staff_members sm
SET user_id = u.id
FROM auth.users u
WHERE sm.user_id IS NULL
  AND sm.email IS NOT NULL
  AND LOWER(u.email) = LOWER(sm.email);
