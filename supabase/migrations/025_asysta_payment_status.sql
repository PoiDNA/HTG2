-- Migration 025: natalia_asysta session type + booking payment status
-- ===================================================================

-- ─── 1. Extend booking_slots session_type CHECK for natalia_asysta ──

ALTER TABLE public.booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_session_type_check;

ALTER TABLE public.booking_slots
  ADD CONSTRAINT booking_slots_session_type_check
  CHECK (session_type IN (
    'natalia_solo', 'natalia_agata', 'natalia_justyna',
    'pre_session', 'natalia_para', 'natalia_asysta'
  ));

-- ─── 2. Add payment tracking columns to bookings ───────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending_verification'
    CHECK (payment_status IN ('confirmed_paid', 'installments', 'pending_verification')),
  ADD COLUMN IF NOT EXISTS payment_comment TEXT;

-- ─── 3. Set existing imported sessions (source='import') as confirmed_paid ──

UPDATE public.bookings
SET payment_status = 'confirmed_paid'
WHERE status = 'confirmed'
  AND id IN (
    SELECT b.id FROM public.bookings b
    JOIN public.orders o ON b.order_id = o.id
    WHERE o.source = 'import'
  );
