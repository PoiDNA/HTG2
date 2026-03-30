-- Add wix_created_at to profiles
-- Stores the original WIX account creation date imported from htg_users.json export.
-- We preserve profiles.created_at (Supabase signup date) and add this separate column.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wix_created_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.wix_created_at IS
  'Original WIX account creation date, imported from WIX member export (htg_users.json). NULL for accounts created natively in Supabase.';
