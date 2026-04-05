-- 041: Change passkey public_key from BYTEA to TEXT
-- BYTEA causes encoding issues: Supabase returns hex format (\x...)
-- but the code stores/reads base64 strings. TEXT avoids the mismatch.
-- ============================================================

-- Clear any existing credentials (they have corrupted encoding)
TRUNCATE public.passkey_credentials;

-- Change column type
ALTER TABLE public.passkey_credentials ALTER COLUMN public_key TYPE TEXT;
