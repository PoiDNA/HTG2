-- Migration 045: Add natalia_przemek session type + Przemek as assistant
-- ===================================================================

-- ─── 1. Extend booking_slots session_type CHECK for natalia_przemek ──

ALTER TABLE public.booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_session_type_check;

ALTER TABLE public.booking_slots
  ADD CONSTRAINT booking_slots_session_type_check
  CHECK (session_type IN (
    'natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_przemek',
    'pre_session', 'natalia_para', 'natalia_asysta'
  ));

-- ─── 2. Add Przemek as assistant staff member ──────────────────────

INSERT INTO public.staff_members (name, slug, role, session_types, email, is_active)
VALUES (
  'Przemek',
  'przemek',
  'assistant',
  ARRAY['natalia_przemek'],
  'przemek@htg.cyou',
  true
)
ON CONFLICT (slug) DO UPDATE SET
  role = EXCLUDED.role,
  session_types = EXCLUDED.session_types,
  email = EXCLUDED.email,
  is_active = EXCLUDED.is_active;

-- Link to auth user if exists
UPDATE public.staff_members
SET user_id = (SELECT id FROM auth.users WHERE email = 'przemek@htg.cyou' LIMIT 1)
WHERE slug = 'przemek'
  AND user_id IS NULL
  AND EXISTS (SELECT 1 FROM auth.users WHERE email = 'przemek@htg.cyou');
