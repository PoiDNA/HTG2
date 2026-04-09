-- ============================================================================
-- Migration 054: session_client_insights_audit
--
-- Audit log for any access to session_client_insights data (transcripts +
-- AI-extracted client journey insights). RODO art. 9 sensitive data — every
-- read by staff must be loggable so we can answer "kto i kiedy widział moje
-- dane" within the deadline of art. 15.
--
-- Pattern follows client_recording_audit (migration 050) and admin_audit_log
-- (037): no FK on the target row id (so audit persists after the insights
-- record is deleted), actor_id nullable (system actor for cron deletions),
-- structured action enum + free-form details JSONB for action-specific context.
--
-- This migration is INFRASTRUCTURE only — no UI yet. The actual reads are
-- audited in PR B (admin transcript viewer + PDF export) which uses a helper
-- in lib/audit/insights-audit.ts.
-- ============================================================================

-- ─── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_client_insights_audit (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Reference to insights row by booking_id (stable, survives row recreation).
  -- We deliberately do NOT use FK so that audit entries persist after
  -- session_client_insights row is deleted via consent withdrawal.
  booking_id      UUID         NOT NULL,
  actor_id        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Email captured at the time of the action — survives actor account deletion.
  -- Useful for answering "who saw my data?" even if the staff member's account
  -- has since been removed (rare but legally important for art. 15 responses).
  actor_email     TEXT,
  action          TEXT         NOT NULL CHECK (action IN (
    'viewed_list',          -- opened the admin recording list (booking_id = nil sentinel)
    'viewed_transcript',    -- expanded the transcript accordion for one row
    'viewed_insights',      -- viewed extracted insights (problems, emotions, ...)
    'downloaded_pdf'        -- downloaded transcript PDF
  )),
  details         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scia_booking
  ON public.session_client_insights_audit(booking_id);
CREATE INDEX IF NOT EXISTS idx_scia_actor
  ON public.session_client_insights_audit(actor_id)
  WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scia_created
  ON public.session_client_insights_audit(created_at DESC);
-- Composite for "show me everyone who looked at booking X, ordered by time":
CREATE INDEX IF NOT EXISTS idx_scia_booking_created
  ON public.session_client_insights_audit(booking_id, created_at DESC);

-- ─── RLS — admin/service_role only ───────────────────────────────────────────
ALTER TABLE public.session_client_insights_audit ENABLE ROW LEVEL SECURITY;

-- Service role: full access (for inserts from API routes + cron deletions).
DROP POLICY IF EXISTS scia_service_all ON public.session_client_insights_audit;
CREATE POLICY scia_service_all ON public.session_client_insights_audit
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: NO access. Audit logs are read only via service role
-- from server components / API routes that perform admin checks themselves.
-- We deliberately do NOT expose this table via PostgREST to authenticated
-- clients to prevent accidental leakage of "who looked at whose data".

-- ─── Comment ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.session_client_insights_audit IS
  'Audit log for staff access to session_client_insights (RODO art. 9 sensitive data). Every read of transcripts or extracted insights is logged here. Insertion via lib/audit/insights-audit.ts helper from server-side admin routes.';
