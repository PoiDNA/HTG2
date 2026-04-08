-- ============================================================
-- 050: client_recordings audit log + staff need-to-know support
-- ============================================================
--
-- BACKGROUND (Faza 6 of the client_recordings triage plan)
--
-- Adds an audit trail for every access / modification / deletion of
-- client_recordings, satisfying two requirements:
--
-- 1. RODO art. 15 right-of-access transparency:
--    When a data subject asks "who has seen my recordings?", we need to
--    answer with a real log instead of "we don't track that".
--
-- 2. Staff accountability in a therapeutic context:
--    Before this PR, any STAFF_EMAILS member (admin + 4 staff) could
--    open /konto/nagrania-klienta and see all clients' before/after
--    recordings with no trace. For therapy data, that's a structural
--    privacy problem even if nobody has misused it yet.
--
-- This migration creates the audit table. Application code (in sibling
-- commits of the same PR) starts writing rows.
--
-- The staff need-to-know filter is ALSO introduced in this PR but as
-- application-level logic in page.tsx — not in a DB policy, because all
-- access goes through service_role anyway (see migrations 049 and 048).
--
-- TABLE DESIGN
-- Deliberately lightweight: one row per action, no joins back to
-- client_recordings needed to understand what happened. recording_id has
-- NO foreign key — audit rows must survive the deletion of the recording
-- they reference (art. 30 RODO records of processing activities).
--
-- SENTINEL VALUE for list views
-- The action='viewed_list' represents "staff opened the listing page"
-- without a specific recording_id. We use the nil UUID
-- '00000000-0000-0000-0000-000000000000' as a sentinel (matches existing
-- pattern in booking_recording_audit.actor_id for system actions).

CREATE TABLE IF NOT EXISTS public.client_recording_audit (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NO FK on recording_id: audit must persist after recording is purged
  recording_id  UUID        NOT NULL,
  actor_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL CHECK (action IN (
    'viewed_list',      -- staff opened /konto/nagrania-klienta (recording_id = nil sentinel)
    'played',           -- someone hit play on a specific recording
    'deleted',          -- owner soft-deleted via DELETE endpoint
    'expired',          -- (reserved) cron expired (currently disabled in HTG2)
    'purged'            -- cron section 6 hard-deleted after 14d grace
  )),
  details       JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Index for "find all audit rows for this recording" queries.
CREATE INDEX idx_cra_recording
  ON public.client_recording_audit(recording_id);

-- Index for "what has this actor done" queries (staff accountability).
CREATE INDEX idx_cra_actor
  ON public.client_recording_audit(actor_id)
  WHERE actor_id IS NOT NULL;

-- Index for time-based queries ("who watched X yesterday").
CREATE INDEX idx_cra_created
  ON public.client_recording_audit(created_at DESC);

-- RLS: same pattern as client_recordings (after PR #259) — enabled, zero
-- policies for non-service_role. All audit reads/writes go through the
-- server-side API with service_role, which bypasses RLS.
ALTER TABLE public.client_recording_audit ENABLE ROW LEVEL SECURITY;

-- End-state assertion: no non-service_role policies should exist on this
-- fresh table. Cheap safety-net for future migrations that might add
-- ad-hoc policies via the Supabase dashboard.
DO $$
DECLARE
  policy_count int;
BEGIN
  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'client_recording_audit'
    AND NOT (roles = ARRAY['service_role']::name[]);

  IF policy_count > 0 THEN
    RAISE EXCEPTION
      'client_recording_audit should have 0 non-service_role policies after migration, found %',
      policy_count;
  END IF;
END $$;
