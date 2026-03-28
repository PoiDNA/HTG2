-- Migration 024: Payment tracking for session imports
-- ==================================================
-- Adds payment tracking columns to orders, import_key for idempotent imports,
-- and extends CHECK constraints for new source/status values.

-- ─── 1. Extend orders.source CHECK constraint to include 'import' ──────────

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_source_check;

-- The original constraint was added inline in migration 002; DROP by generated name too
DO $$
BEGIN
  -- Try to drop the constraint by checking if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'orders' AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%source%'
  ) THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' ||
      (SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'orders' AND constraint_type = 'CHECK'
         AND constraint_name LIKE '%source%' LIMIT 1);
  END IF;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_check
  CHECK (source IN ('stripe', 'wix', 'manual', 'migration', 'import'));

-- ─── 2. Extend orders.status CHECK constraint to include 'partial' ─────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'orders' AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%status%'
  ) THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' ||
      (SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'orders' AND constraint_type = 'CHECK'
         AND constraint_name LIKE '%status%' LIMIT 1);
  END IF;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'partial'));

-- ─── 3. Add payment tracking columns to orders ────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_paid INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'transfer'
    CHECK (payment_method IN ('transfer', 'stripe', 'cash', 'barter', 'other')),
  ADD COLUMN IF NOT EXISTS payment_notes TEXT,
  ADD COLUMN IF NOT EXISTS import_key TEXT UNIQUE;

-- ─── 4. Add import_key to booking_slots for idempotent imports ─────────────

ALTER TABLE public.booking_slots
  ADD COLUMN IF NOT EXISTS import_key TEXT UNIQUE;
