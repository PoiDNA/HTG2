-- Add second/alternative email to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS second_email TEXT;
COMMENT ON COLUMN profiles.second_email IS 'Dodatkowy adres email klienta';
