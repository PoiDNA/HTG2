-- Bank transfer proof storage for individual session bookings.
-- Users upload proof-of-transfer when choosing bank transfer payment.
-- Admin verifies and confirms the booking.

-- 1. Storage bucket with server-side limits
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('transfer-proofs', 'transfer-proofs', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies (no DELETE — admin needs proof preserved)
CREATE POLICY "Users upload transfer proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'transfer-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own transfer proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'transfer-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff read all transfer proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'transfer-proofs' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  ));

-- 3. Booking columns for transfer proof tracking
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS transfer_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS transfer_proof_filename TEXT;

-- Prevent reuse of the same proof across multiple bookings
CREATE UNIQUE INDEX IF NOT EXISTS bookings_transfer_proof_url_unique
  ON public.bookings (transfer_proof_url) WHERE transfer_proof_url IS NOT NULL;
