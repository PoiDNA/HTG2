-- 099: gate akceptacji wersji PL przed auto-tłumaczeniem Claude.
--
-- Admin/Editor musi ręcznie potwierdzić że wersja PL (Momenty + transkrypcja)
-- jest gotowa, zanim można odpalić masowe auto-tłumaczenie na EN/DE/PT.
-- Endpoint POST /api/admin/fragments/sessions/[sessionId]/translate sprawdza
-- pl_approved_at — jeśli NULL, zwraca 403.

ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS pl_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pl_approved_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.session_templates.pl_approved_at IS
  'Timestamp akceptacji wersji PL (Momenty + transkrypcja) przez admina/edytora. Warunek wstępny auto-tłumaczenia Claude na EN/DE/PT.';
