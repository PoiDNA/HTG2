-- Fix pre-existing bug: RLS in 008_publication_system.sql references 'publikacja'
-- but the CHECK constraint from 002 only allows user/admin/moderator.
-- Also add the new 'translator' role.

-- Safely drop the auto-named CHECK constraint on profiles.role
DO $$
DECLARE cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid
    AND a.attnum = ANY(c.conkey)
    AND a.attname = 'role'
  WHERE c.conrelid = 'public.profiles'::regclass
    AND c.contype = 'c';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'moderator', 'publikacja', 'translator'));

-- Translation issues table — translators report errors, admin resolves
CREATE TABLE public.translation_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'de', 'pt')),
  page_url TEXT NOT NULL,
  current_text TEXT NOT NULL,
  suggested_fix TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE translation_issues ENABLE ROW LEVEL SECURITY;

-- Translators: INSERT + SELECT own issues
CREATE POLICY "translator_insert" ON translation_issues
  FOR INSERT WITH CHECK (
    auth.uid() = reporter_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'translator')
  );

CREATE POLICY "translator_select_own" ON translation_issues
  FOR SELECT USING (
    auth.uid() = reporter_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'translator')
  );

-- Admin: full CRUD
CREATE POLICY "admin_all" ON translation_issues
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
