-- Migration 010: Per-play audit log + user violation flags
-- ============================================================

-- ─── 1. play_events — core audit log ────────────────────────

CREATE TABLE public.play_events (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id            TEXT        NOT NULL,   -- session_template.id or session_publication.id
  session_type          TEXT        NOT NULL DEFAULT 'vod'
                        CHECK (session_type IN ('vod', 'recording', 'live')),
  device_id             TEXT,                   -- localStorage fingerprint
  ip_address            TEXT,
  country_code          TEXT,                   -- from Vercel x-vercel-ip-country header (free)
  user_agent            TEXT,
  play_duration_seconds INT,                    -- filled on stop
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at              TIMESTAMPTZ
);

CREATE INDEX idx_play_events_user        ON public.play_events(user_id, started_at DESC);
CREATE INDEX idx_play_events_session     ON public.play_events(session_id, started_at DESC);
CREATE INDEX idx_play_events_ip          ON public.play_events(ip_address, started_at DESC);
CREATE INDEX idx_play_events_country     ON public.play_events(country_code, started_at DESC);

-- ─── 2. user_flags — violation tracking ─────────────────────

CREATE TABLE public.user_flags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type     TEXT        NOT NULL
                CHECK (flag_type IN (
                  'ip_diversity',       -- wielu użytkowników korzysta z tego konta
                  'high_frequency',     -- zbyt wiele odtworzeń jednej sesji
                  'concurrent_countries', -- równoczesne odtwarzanie z różnych krajów
                  'mass_play',          -- podejrzanie duże odtwarzanie w ciągu dnia
                  'manual'              -- flaga ustawiona ręcznie przez admina
                )),
  severity      TEXT        NOT NULL DEFAULT 'warning'
                CHECK (severity IN ('info', 'warning', 'critical')),
  details       JSONB       NOT NULL DEFAULT '{}',
  auto_detected BOOLEAN     NOT NULL DEFAULT true,
  resolved      BOOLEAN     NOT NULL DEFAULT false,
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID        REFERENCES auth.users(id),
  resolution_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_flags_user        ON public.user_flags(user_id, created_at DESC);
CREATE INDEX idx_user_flags_unresolved  ON public.user_flags(resolved, severity, created_at DESC)
                                         WHERE resolved = false;

-- ─── 3. Blocking columns on profiles ────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_at   TIMESTAMPTZ;

CREATE INDEX idx_profiles_blocked ON public.profiles(is_blocked) WHERE is_blocked = true;

-- ─── 4. RLS ─────────────────────────────────────────────────

ALTER TABLE public.play_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_flags  ENABLE ROW LEVEL SECURITY;

-- play_events: only service role writes; no client reads
CREATE POLICY "play_events_service_only" ON public.play_events
  FOR ALL USING (false);

-- user_flags: only admin reads/writes (via service role)
CREATE POLICY "user_flags_service_only" ON public.user_flags
  FOR ALL USING (false);

-- ─── 5. Retention: auto-delete play_events after 2 years ────
-- (run periodically via pg_cron or manual cleanup)

COMMENT ON TABLE public.play_events IS
  'Audit log — every video/recording play event. Retain 2 years max.';
COMMENT ON TABLE public.user_flags IS
  'Violation flags auto-detected from play_events patterns.';
