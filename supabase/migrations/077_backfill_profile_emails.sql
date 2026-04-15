-- Migration 077: Backfill profiles.email from auth.users
-- =============================================================================
-- The handle_new_user() trigger was updated in migration 034 to populate
-- profiles.email, but existing users created before that migration have
-- email = NULL in profiles. This backfill syncs them.
--
-- The check-email API (app/api/auth/check-email/route.ts) queries profiles.email,
-- so any user with a NULL email cannot log in despite having a valid auth account.

UPDATE public.profiles p
SET email = LOWER(u.email)
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;
