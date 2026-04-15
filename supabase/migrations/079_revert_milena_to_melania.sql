-- 079_revert_milena_to_melania.sql
-- Cofnięcie zmiany z 078: wraca Melania jako tłumaczka EN, Milena nie istnieje.
--
-- Kontekst: w migracji 078 dodaliśmy Milena (milena@htg.cyou) i ustawiliśmy
-- Melania is_active=false. Użytkownik zdecydował jednak, że tłumaczką EN jest
-- Melania (melania@htg.cyou). Konto milena@htg.cyou nie będzie istnieć.

-- ─── 1. Reaktywuj Melanię ───────────────────────────────────────────────────
UPDATE public.staff_members
SET is_active = true,
    user_id = COALESCE(user_id, (SELECT id FROM auth.users WHERE email = 'melania@htg.cyou' LIMIT 1))
WHERE slug = 'melania';

-- ─── 2. Usuń wpis Mileny (nie będzie takiego usera) ─────────────────────────
DELETE FROM public.staff_members WHERE slug = 'milena';
