-- 034: Auth enhancements — OAuth profile sync + passkey credentials
-- ============================================================

-- Update handle_new_user() to support OAuth providers (Google, Apple, Facebook)
-- They populate different meta fields: 'full_name', 'name', 'avatar_url', 'email'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NEW.email,
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(profiles.display_name, EXCLUDED.display_name),
    email = COALESCE(profiles.email, EXCLUDED.email),
    avatar_url = COALESCE(profiles.avatar_url, EXCLUDED.avatar_url);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Passkey credentials (WebAuthn)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL DEFAULT 'singleDevice',
  backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[],
  friendly_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id ON public.passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_credential_id ON public.passkey_credentials(credential_id);

ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own passkeys
CREATE POLICY passkey_own_select ON public.passkey_credentials
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY passkey_own_insert ON public.passkey_credentials
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY passkey_own_delete ON public.passkey_credentials
  FOR DELETE USING (auth.uid() = user_id);
