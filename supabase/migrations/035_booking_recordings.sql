-- ============================================================
-- 035: Booking Recordings — nagrania z sesji 1:1, Asysta, Par
-- Dane wrażliwe (art. 9 RODO) — dostęp admin only
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Rozszerzenie consent_records o FK do bookings
-- ────────────────────────────────────────────────────────────
ALTER TABLE consent_records
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id);

CREATE INDEX IF NOT EXISTS idx_consent_booking ON consent_records(booking_id)
  WHERE consent_type IN ('session_recording_capture', 'session_recording_access');


-- ────────────────────────────────────────────────────────────
-- 2. System Actor — zarezerwowany UUID dla cron/webhook/system
-- ────────────────────────────────────────────────────────────
INSERT INTO profiles (id, display_name)
VALUES ('00000000-0000-0000-0000-000000000000', 'System')
ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 3. booking_recordings — jedno nagranie per Egress
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id),
  live_session_id UUID REFERENCES live_sessions(id),
  egress_id TEXT,                       -- LiveKit Egress ID — stabilny identyfikator biznesowy
  bunny_video_id TEXT,                  -- NULL dopóki Bunny nie stworzy
  bunny_library_id TEXT,
  session_type TEXT,                    -- denormalizacja z booking
  session_date DATE,                    -- denormalizacja do sortowania
  duration_seconds INT,
  recording_started_at TIMESTAMPTZ,    -- kiedy Egress faktycznie wystartował
  title TEXT,
  source TEXT NOT NULL CHECK (source IN ('live', 'import')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',       -- webhook odebrany, upload nie wystartował
    'preparing',    -- createVideo() w Bunny udane, czeka na fetch
    'uploading',    -- Bunny pobiera plik z R2
    'processing',   -- Bunny enkoduje
    'ready',        -- gotowe do odtwarzania
    'failed',       -- błąd (retry wyczerpane)
    'ignored',      -- fragment <60s — nie wysyłany do Bunny
    'expired'       -- retencja wygasła / usunięte
  )),
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,         -- ostatnie sprawdzenie przez cron
  source_url TEXT,                     -- ścieżka R2 — NIGDY nie zerowana
  source_cleaned_at TIMESTAMPTZ,       -- IS NOT NULL = fizycznie usunięty z R2
  import_filename TEXT,
  import_confidence TEXT CHECK (import_confidence IN ('exact_email', 'manual_review', 'admin_assigned')),
  expires_at TIMESTAMPTZ,              -- snapshot polityki w momencie tworzenia
  legal_hold BOOLEAN DEFAULT false,    -- true = retencja zawieszona
  legal_hold_reason TEXT,
  min_duration_seconds INT DEFAULT 60, -- próg jakości
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Idempotentność: jeden rekord per Egress
  UNIQUE(egress_id)
);

CREATE INDEX IF NOT EXISTS idx_br_status ON booking_recordings(status)
  WHERE status IN ('queued', 'preparing', 'uploading', 'processing');
CREATE INDEX IF NOT EXISTS idx_br_expires ON booking_recordings(expires_at)
  WHERE status = 'ready' AND legal_hold = false;
CREATE INDEX IF NOT EXISTS idx_br_booking ON booking_recordings(booking_id);
CREATE INDEX IF NOT EXISTS idx_br_cron ON booking_recordings(last_checked_at)
  WHERE status IN ('uploading', 'processing', 'preparing');

ALTER TABLE public.booking_recordings ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- 4. booking_recording_access — kto ma dostęp do nagrania
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_recording_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES booking_recordings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT now(),
  granted_reason TEXT NOT NULL CHECK (granted_reason IN (
    'booking_client', 'companion', 'import_match', 'admin_grant'
  )),
  consent_record_id UUID REFERENCES consent_records(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  revoked_reason TEXT,
  UNIQUE(recording_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bra_user ON booking_recording_access(user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bra_recording ON booking_recording_access(recording_id);

ALTER TABLE public.booking_recording_access ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- 5. booking_recording_audit — trwały ślad audytowy
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_recording_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL,          -- bez FK — rekord nagrania może być usunięty
  action TEXT NOT NULL CHECK (action IN (
    -- Lifecycle
    'recording_created', 'recording_ignored',
    'bunny_video_created', 'bunny_fetch_started',
    'bunny_encoding', 'bunny_ready', 'bunny_failed', 'bunny_deleted',
    'source_cleaned', 'expired', 'retry', 'preparing_stuck_reset',
    -- Consent
    'consent_capture_granted', 'consent_access_granted',
    -- Access
    'access_granted', 'access_revoked',
    -- Disputes
    'pair_revoke_emergency', 'admin_dispute_resolved',
    -- Notifications
    'notification_sent',
    -- Admin
    'admin_decision', 'legal_hold_set', 'legal_hold_released',
    -- Import
    'import_matched', 'import_manual_review', 'import_admin_assigned',
    -- Orphan
    'orphan_deleted'
  )),
  actor_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_recording ON booking_recording_audit(recording_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON booking_recording_audit(action);

ALTER TABLE public.booking_recording_audit ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- 6. RLS — admin ONLY (nie moderator, nie staff)
-- ────────────────────────────────────────────────────────────

-- User widzi recording jeśli ma aktywny (nieodwołany) dostęp
CREATE POLICY br_user_select ON booking_recordings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM booking_recording_access
    WHERE recording_id = booking_recordings.id
      AND user_id = auth.uid()
      AND revoked_at IS NULL
  )
);

-- User widzi własne access rows
CREATE POLICY bra_own_select ON booking_recording_access FOR SELECT
  USING (auth.uid() = user_id);

-- User może revoke'ować własny access (self-service)
CREATE POLICY bra_own_update ON booking_recording_access FOR UPDATE
  USING (auth.uid() = user_id);

-- Admin: pełen dostęp do nagrań (admin = Natalia, właścicielka + terapeutka)
CREATE POLICY br_admin_all ON booking_recordings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY bra_admin_all ON booking_recording_access FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Audit: admin read-only
CREATE POLICY audit_admin_select ON booking_recording_audit FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Service role: pełen insert/update (webhook, cron, import) — domyślnie bypasuje RLS


-- ────────────────────────────────────────────────────────────
-- 7. active_streams — osobny limit per typ (VOD vs recording)
-- ────────────────────────────────────────────────────────────
ALTER TABLE active_streams
  ADD COLUMN IF NOT EXISTS booking_recording_id UUID REFERENCES booking_recordings(id);

-- session_id staje się nullable
DO $$ BEGIN
  ALTER TABLE active_streams ALTER COLUMN session_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Dokładnie jedna referencja musi być wypełniona
DO $$ BEGIN
  ALTER TABLE active_streams ADD CONSTRAINT exactly_one_stream_reference CHECK (
    (session_id IS NOT NULL AND booking_recording_id IS NULL)
    OR (session_id IS NULL AND booking_recording_id IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 8. RPC — czysty walidator zgody (read-only, zero UPDATE)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_recording_consent(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_session live_sessions%ROWTYPE;
  v_booking bookings%ROWTYPE;
  v_capture_count INT;
  v_required_count INT;
BEGIN
  -- Lock sesji zapobiega race condition przy concurrent consent
  SELECT * INTO v_session FROM live_sessions
    WHERE booking_id = p_booking_id
    FOR UPDATE;

  IF v_session IS NULL OR v_session.phase != 'sesja' THEN
    RETURN jsonb_build_object('can_start', false, 'reason', 'not_in_sesja_phase');
  END IF;

  IF v_session.egress_sesja_id IS NOT NULL THEN
    RETURN jsonb_build_object('can_start', false, 'reason', 'already_recording');
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;

  -- Ile osób musi wyrazić zgodę?
  IF v_booking.session_type = 'natalia_para' THEN
    v_required_count := 1 + (
      SELECT count(*) FROM booking_companions
      WHERE booking_id = p_booking_id AND user_id IS NOT NULL
    );
  ELSE
    v_required_count := 1;
  END IF;

  -- Ile osób wyraziło zgodę capture?
  SELECT count(DISTINCT user_id) INTO v_capture_count
  FROM consent_records
  WHERE booking_id = p_booking_id
    AND consent_type = 'session_recording_capture'
    AND granted = true;

  IF v_capture_count >= v_required_count THEN
    RETURN jsonb_build_object(
      'can_start', true,
      'session_id', v_session.id,
      'room_name', v_session.room_name
    );
  ELSE
    RETURN jsonb_build_object(
      'can_start', false,
      'reason', 'waiting_for_consent',
      'have', v_capture_count,
      'need', v_required_count
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
