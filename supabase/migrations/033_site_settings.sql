-- Site settings — admin-managed key/value store
CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'null',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write (via service role in API routes)
-- Public can read via service role in server components
-- No client-side access needed

-- Seed defaults
INSERT INTO public.site_settings (key, value) VALUES
  ('community_enabled',      'true'),
  ('community_title',        '"Społeczność HTG"'),
  ('community_description',  '"Przestrzeń dla uczestników HTG — dziel się doświadczeniami, zadawaj pytania i wspieraj innych."'),
  ('community_welcome',      '"Witaj w społeczności HTG! To miejsce stworzone z myślą o Tobie."'),
  ('community_show_in_nav',  'true')
ON CONFLICT (key) DO NOTHING;
