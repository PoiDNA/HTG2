-- Migration 027: Account update requests (zgłoszenia aktualizacji konta)
-- Users can report missing purchases from WIX migration

CREATE TABLE IF NOT EXISTS public.account_update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What category: 'session_single', 'session_monthly', 'session_yearly', 'individual_1on1', 'individual_asysta', 'individual_para'
  category TEXT NOT NULL CHECK (category IN (
    'session_single', 'session_monthly', 'session_yearly',
    'individual_1on1', 'individual_asysta', 'individual_para'
  )),

  -- User description of what they bought
  description TEXT NOT NULL,

  -- When they bought it (approximate)
  purchase_date DATE,

  -- Proof of purchase (URL to uploaded file)
  proof_url TEXT,
  proof_filename TEXT,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Admin response/notes
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_account_update_requests_user ON public.account_update_requests(user_id);
CREATE INDEX idx_account_update_requests_status ON public.account_update_requests(status);

-- RLS
ALTER TABLE public.account_update_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "Users can view own requests"
  ON public.account_update_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own requests
CREATE POLICY "Users can create own requests"
  ON public.account_update_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role (admin) can do everything
CREATE POLICY "Service role full access"
  ON public.account_update_requests FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage bucket for proof files
INSERT INTO storage.buckets (id, name, public)
VALUES ('account-proofs', 'account-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder
CREATE POLICY "Users upload own proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'account-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can view their own proofs
CREATE POLICY "Users view own proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'account-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admins (service role) can view all proofs
CREATE POLICY "Service role view all proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'account-proofs');
