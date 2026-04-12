-- Add preferred_locale to profiles for locale-aware emails, crons, and content
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_locale TEXT DEFAULT 'pl';
