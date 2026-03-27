-- Migration 009: Webhook fixes — race condition, performance, security
-- =======================================================================

-- ─── Fix 1: SECURITY DEFINER + SET search_path (Search Path Hijacking) ──

CREATE OR REPLACE FUNCTION public.get_my_pub_role()
RETURNS TEXT AS $$
  SELECT COALESCE(role, 'user')
  FROM public.profiles
  WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- ─── Fix 2: Atomic JSONB update for track recordings (Race Condition) ────
-- Eliminates the read-modify-write race condition in the webhook handler.
-- Uses a row-level lock (FOR UPDATE) to guarantee that concurrent webhooks
-- for the same session do not overwrite each other.

CREATE OR REPLACE FUNCTION public.complete_session_track_egress(
  p_egress_id TEXT,
  p_file_url  TEXT
)
RETURNS TABLE(
  session_id      UUID,
  participant_id  TEXT,
  all_tracks_done BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id      UUID;
  v_participant_id  TEXT;
  v_updated_tracks  JSONB;
  v_track_ids       JSONB;
  v_expected        BIGINT;
  v_recorded        BIGINT;
BEGIN
  -- Find the matching session row and lock it to prevent concurrent updates
  SELECT ls.id, kv.key
  INTO   v_session_id, v_participant_id
  FROM   public.live_sessions ls,
         jsonb_each_text(ls.egress_sesja_tracks_ids) kv
  WHERE  kv.value = p_egress_id
  LIMIT  1
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    RETURN;  -- No matching session — silently ignore
  END IF;

  -- Merge the new URL atomically; previous value for this key is overwritten safely
  UPDATE public.live_sessions
  SET    recording_sesja_tracks =
           COALESCE(recording_sesja_tracks, '{}'::jsonb)
           || jsonb_build_object(v_participant_id, p_file_url)
  WHERE  id = v_session_id
  RETURNING recording_sesja_tracks, egress_sesja_tracks_ids
  INTO   v_updated_tracks, v_track_ids;

  -- Count expected vs. recorded tracks
  SELECT count(*) INTO v_expected FROM jsonb_object_keys(v_track_ids);
  SELECT count(*) INTO v_recorded FROM jsonb_object_keys(v_updated_tracks);

  RETURN QUERY
    SELECT v_session_id, v_participant_id, (v_recorded >= v_expected);
END;
$$;

-- Grant execute to service role (used by webhook server action)
GRANT EXECUTE ON FUNCTION public.complete_session_track_egress(TEXT, TEXT) TO service_role;

-- ─── Fix 3: UNIQUE constraint to prevent duplicate publications ───────────
-- Prevents double-click or simultaneous webhook+admin from creating two
-- session_publications for the same live_session.

ALTER TABLE public.session_publications
  ADD CONSTRAINT session_publications_live_session_unique
  UNIQUE (live_session_id);
