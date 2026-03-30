-- ============================================================
-- 037: Footer templates (email signatures with default)
-- ============================================================
-- Reuses existing message_templates table with category='footer'.
-- Adds is_default_footer flag for auto-append behavior.
-- ============================================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS is_default_footer BOOLEAN DEFAULT false;

-- Ensure only one default footer at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_footer
  ON message_templates (is_default_footer)
  WHERE is_default_footer = true AND is_active = true;
