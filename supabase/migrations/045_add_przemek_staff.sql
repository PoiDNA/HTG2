-- Migration 045: Add przemek@htg.cyou as practitioner staff member
-- ===================================================================
-- Gives Przemek the same panel view as Natalia (sees all session types)

INSERT INTO public.staff_members (name, slug, role, session_types, email, is_active)
VALUES (
  'Przemek',
  'przemek',
  'practitioner',
  ARRAY['natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_para', 'natalia_asysta'],
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
