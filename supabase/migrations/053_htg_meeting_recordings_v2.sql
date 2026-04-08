/* Migration 053: HTG Meeting Recordings v2 — pipeline schema
   ============================================================================
   PR #2 of the HTG Meeting Recording Pipeline (see plan v8).

   Adds:
   - htg_meeting_egresses           — junction table (one row per egress)
   - htg_meeting_pending_egresses   — two-phase commit bridge (race protection)
   - htg_meeting_recordings_v2      — recording rows after upload
   - htg_meeting_recording_access   — access control (mirror booking_recording_access)
   - htg_meeting_recording_audit    — audit trail (no DB CHECK on action — validated in TS)
   - htg_meeting_active_streams     — concurrent playback limit
   - try_claim_active_stream        — atomic UPSERT RPC for token endpoint

   Does NOT drop old htg_meeting_recordings (v1) — that's migration 054 (PR #7)
   together with the recording-check endpoint update. Prevents deploy gap where
   endpoint queries a table that was dropped between PR merges.

   FK chain uses ON DELETE SET NULL throughout (session → egress → recording) so
   that admin session DELETE or GDPR erasure request does NOT cascade-delete
   recordings and audit history. Orphaned rows stay visible to admin only.
*/


/* ── Junction table: one row per egress (both composite and track) ────── */
/* v5 change: meeting_session_id uses ON DELETE SET NULL (not CASCADE) so that
   recording history survives session delete. Admin panel filters out rows
   with NULL session_id. */
CREATE TABLE IF NOT EXISTS public.htg_meeting_egresses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_session_id    UUID REFERENCES public.htg_meeting_sessions(id) ON DELETE SET NULL,
  egress_id             TEXT NOT NULL UNIQUE,
  egress_kind           TEXT NOT NULL CHECK (egress_kind IN ('composite', 'track')),

  /* For track egresses: who is being recorded */
  participant_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_identity  TEXT,    -- LiveKit identity format "userId:sanitized_display_name"

  /* Lifecycle */
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at              TIMESTAMPTZ,    -- set when stopEgress succeeds
  stop_error            TEXT,           -- non-null when stopEgress failed (fail-closed)
  source_url            TEXT,           -- R2 key (from egress_ended webhook)
  duration_seconds      INT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hme_session ON public.htg_meeting_egresses(meeting_session_id);
CREATE INDEX IF NOT EXISTS idx_hme_active
  ON public.htg_meeting_egresses(meeting_session_id)
  WHERE ended_at IS NULL;

/* Partial UNIQUE: one active track egress per user per session.
   Prevents race between control/start and participant_joined webhook.
   Partial predicate allows multiple historical tracks per user (reconnects).

   Note: after session DELETE (ON DELETE SET NULL above), orphaned rows have
   meeting_session_id=NULL. PostgreSQL treats NULL as distinct in UNIQUE indexes,
   so multiple orphaned rows may coexist — acceptable because no new egresses
   can be created for a deleted session. */
CREATE UNIQUE INDEX IF NOT EXISTS idx_hme_one_active_track
  ON public.htg_meeting_egresses (meeting_session_id, participant_user_id)
  WHERE egress_kind = 'track' AND ended_at IS NULL;

/* Partial UNIQUE: one active composite per session. Separate index from track
   uniqueness because NULL in participant_user_id makes the track index's
   partial predicate exclude composite rows. */
CREATE UNIQUE INDEX IF NOT EXISTS idx_hme_one_active_composite
  ON public.htg_meeting_egresses (meeting_session_id)
  WHERE egress_kind = 'composite' AND ended_at IS NULL;

ALTER TABLE public.htg_meeting_egresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY hme_admin ON public.htg_meeting_egresses FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* ── Pending egresses: two-phase commit bridge ────────────────────────── */
/* INSERT before calling LiveKit startEgress. After successful junction INSERT,
   DELETE the pending row. If webhook egress_started arrives before junction
   commit (race), it checks pending and audits as race_webhook_ahead_of_commit
   instead of killing the egress as orphan.

   client_request_id lets the API track which pending row it owns across the
   three-step flow (insert → startEgress → junction insert → delete pending). */
CREATE TABLE IF NOT EXISTS public.htg_meeting_pending_egresses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id     UUID NOT NULL UNIQUE,
  meeting_session_id    UUID NOT NULL REFERENCES public.htg_meeting_sessions(id) ON DELETE CASCADE,
  egress_kind           TEXT NOT NULL CHECK (egress_kind IN ('composite', 'track')),
  participant_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_identity  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hmpe_session ON public.htg_meeting_pending_egresses(meeting_session_id);
CREATE INDEX IF NOT EXISTS idx_hmpe_created ON public.htg_meeting_pending_egresses(created_at);

ALTER TABLE public.htg_meeting_pending_egresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY hmpe_admin ON public.htg_meeting_pending_egresses FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* ── Recordings v2: one row per egress after upload ──────────────────── */
/* FK strategy (v5 fix): ALL references use ON DELETE SET NULL to break the
   cascade chain session → egress → recording. Recording history survives
   session delete, GDPR erasure, or admin cleanup. Orphaned rows admin-only. */
CREATE TABLE IF NOT EXISTS public.htg_meeting_recordings_v2 (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  egress_id                 TEXT UNIQUE
    REFERENCES public.htg_meeting_egresses(egress_id) ON DELETE SET NULL,
  meeting_session_id        UUID REFERENCES public.htg_meeting_sessions(id) ON DELETE SET NULL,
  meeting_id                UUID REFERENCES public.htg_meetings(id) ON DELETE SET NULL,

  recording_kind            TEXT NOT NULL CHECK (recording_kind IN ('composite', 'track')),
  participant_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  /* File location */
  source_url                TEXT,               -- R2 object key
  backup_storage_path       TEXT,               -- Bunny Storage path
  backup_storage_zone       TEXT,

  /* Metadata */
  recording_started_at      TIMESTAMPTZ,
  duration_seconds          INT,
  session_date              DATE,

  /* Lifecycle (linear state machine) */
  status                    TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'uploading', 'ready', 'failed', 'ignored')),
  last_error                TEXT,
  retry_count               INT NOT NULL DEFAULT 0,
  max_retries               INT NOT NULL DEFAULT 3,
  min_duration_seconds      INT NOT NULL DEFAULT 30,

  /* Retention — NULL = keep forever (mirror Live Sessions Section 3/4/5 no-op policy) */
  expires_at                TIMESTAMPTZ,
  legal_hold                BOOLEAN NOT NULL DEFAULT false,
  legal_hold_reason         TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hmr_session ON public.htg_meeting_recordings_v2(meeting_session_id);
CREATE INDEX IF NOT EXISTS idx_hmr_meeting ON public.htg_meeting_recordings_v2(meeting_id);
CREATE INDEX IF NOT EXISTS idx_hmr_status ON public.htg_meeting_recordings_v2(status)
  WHERE status IN ('queued', 'uploading', 'ready');
CREATE INDEX IF NOT EXISTS idx_hmr_kind ON public.htg_meeting_recordings_v2(recording_kind);

ALTER TABLE public.htg_meeting_recordings_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY hmrv2_admin ON public.htg_meeting_recordings_v2 FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

/* Participant sees ONLY composite (tracks are admin-only for AI analysis) */
CREATE POLICY hmrv2_participant_composite ON public.htg_meeting_recordings_v2 FOR SELECT USING (
  recording_kind = 'composite'
  AND EXISTS (
    SELECT 1 FROM public.htg_meeting_recording_access a
    WHERE a.recording_id = htg_meeting_recordings_v2.id
      AND a.user_id      = auth.uid()
      AND a.revoked_at   IS NULL
  )
);


/* ── Recording access: user-recording grant matrix ─────────────────────── */
/* No self-revoke policy — revoke happens via API endpoint with service role.
   This mirrors migration 036 fix for booking_recording_access where the
   self-revoke policy allowed UPDATE of recording_id (privilege escalation). */
CREATE TABLE IF NOT EXISTS public.htg_meeting_recording_access (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id    UUID NOT NULL REFERENCES public.htg_meeting_recordings_v2(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_reason  TEXT NOT NULL CHECK (granted_reason IN
                    ('participant', 'moderator', 'admin_grant', 'import_match')),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES auth.users(id),
  revoked_reason  TEXT,
  UNIQUE (recording_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hmra_user ON public.htg_meeting_recording_access(user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.htg_meeting_recording_access ENABLE ROW LEVEL SECURITY;

/* User sees own access rows (read-only — revoke goes through API + service role) */
CREATE POLICY hmra_user_read ON public.htg_meeting_recording_access FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY hmra_admin ON public.htg_meeting_recording_access FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* ── Recording audit trail ──────────────────────────────────────────── */
/* No CHECK constraint on `action` — validation lives in the application via
   TS constant MEETING_AUDIT_ACTIONS (added in lib/live/meeting-constants.ts
   in PR #3). Enforcing action list in DB creates migration coupling with
   every new audit event. */
CREATE TABLE IF NOT EXISTS public.htg_meeting_recording_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id  UUID,    -- no FK (recording may be deleted)
  egress_id     TEXT,    -- webhook uses this before recording row exists
  action        TEXT NOT NULL,
  actor_id      UUID,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hmraudit_recording ON public.htg_meeting_recording_audit(recording_id);
CREATE INDEX IF NOT EXISTS idx_hmraudit_egress ON public.htg_meeting_recording_audit(egress_id);

ALTER TABLE public.htg_meeting_recording_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY hmraudit_admin ON public.htg_meeting_recording_audit FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


/* ── Active streams: concurrent playback limit ──────────────────────── */
/* Mirror booking's active_streams pattern: one device per user per recording
   at a time. Token endpoint uses try_claim_active_stream() RPC below for
   atomic UPSERT-with-WHERE semantics. */
CREATE TABLE IF NOT EXISTS public.htg_meeting_active_streams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id   UUID NOT NULL REFERENCES public.htg_meeting_recordings_v2(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id      TEXT NOT NULL,    -- client-generated stable identifier
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  UNIQUE (recording_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hmas_user_expires ON public.htg_meeting_active_streams(user_id, expires_at);

ALTER TABLE public.htg_meeting_active_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY hmas_admin ON public.htg_meeting_active_streams FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY hmas_user_read ON public.htg_meeting_active_streams FOR SELECT
  USING (user_id = auth.uid());


/* ── Atomic active-stream claim RPC ───────────────────────────────────── */
/* Single-statement UPSERT with WHERE clause cannot be expressed via
   Supabase client's upsert() — the driver doesn't support a condition on
   the UPDATE path of ON CONFLICT. This RPC wraps the raw SQL and is the
   only legitimate way to claim an active stream atomically.

   Returns one row on success, zero rows if another device already has an
   active claim. Token endpoint reads this to return 409 Conflict.

   SECURITY DEFINER so it can bypass RLS for the INSERT/UPDATE; strict
   search_path prevents schema injection; EXECUTE restricted to service_role. */
CREATE OR REPLACE FUNCTION public.try_claim_active_stream(
  p_recording_id UUID,
  p_user_id      UUID,
  p_device_id    TEXT,
  p_expires_at   TIMESTAMPTZ
) RETURNS TABLE(id UUID)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.htg_meeting_active_streams (recording_id, user_id, device_id, expires_at)
  VALUES (p_recording_id, p_user_id, p_device_id, p_expires_at)
  ON CONFLICT (recording_id, user_id) DO UPDATE
    SET device_id  = EXCLUDED.device_id,
        expires_at = EXCLUDED.expires_at,
        started_at = now()
    WHERE htg_meeting_active_streams.expires_at < now()
       OR htg_meeting_active_streams.device_id = EXCLUDED.device_id
  RETURNING htg_meeting_active_streams.id;
END;
$$;

REVOKE ALL ON FUNCTION public.try_claim_active_stream(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_active_stream(UUID, UUID, TEXT, TIMESTAMPTZ) TO service_role;
