-- Migration 103: signed operator contract documents
CREATE TABLE IF NOT EXISTS public.operator_signed_contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_name TEXT NOT NULL,
  operator_email TEXT,
  bunny_path    TEXT NOT NULL,
  cdn_url       TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  signed_by     TEXT NOT NULL CHECK (signed_by IN ('operator', 'admin', 'both')),
  uploaded_by   TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.operator_signed_contracts IS
  'Signed physical operator agreement PDFs stored in Bunny htg2 storage under operator-contracts/.';

ALTER TABLE public.operator_signed_contracts ENABLE ROW LEVEL SECURITY;

-- Public read (visible under the terms page)
CREATE POLICY "public_read_operator_contracts"
  ON public.operator_signed_contracts
  FOR SELECT USING (true);

-- Only service role can insert/delete (admin API uses service role client)
