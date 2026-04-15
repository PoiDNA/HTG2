-- Migration 082: claim_translator_slot + release_translator_slot RPCs
-- =====================================================================================
-- Enables translators (staff_members.role='translator') to self-join Natalia's
-- "Otwarta" slots, converting natalia_solo → natalia_interpreter_solo and setting
-- locale to the translator's language.
--
-- Flow:
--   1. Natalia creates slot as natalia_solo, locale='pl', translator_locked=false
--      → slot is in the PL pool, visible to PL clients
--   2. Translator sees the slot in her "dostępne do dopięcia" list and claims it
--      → slot becomes natalia_interpreter_solo, locale=translator.locale, translator_id=me,
--        end_time += 60min (interpreter takes 180 vs 120 solo)
--      → PL pool loses the slot, translator.locale pool gains it
--   3. Translator can release before booking happens
--      → reverts to natalia_solo, locale='pl', translator_id=null, end_time = start + 120min
--
-- Conflict safety:
--   - SELECT FOR UPDATE serializes concurrent claims on same slot
--   - Explicit conflict check: rejects claim if extending to 180min overlaps
--     any OTHER active slot on same day
--   - DB CHECK (from migration 080) blocks translator_locked=true override
--   - DB CHECK (from migration 080) requires translator_id != null when locale != 'pl'

-- ─── 1. claim_translator_slot ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_translator_slot(
  p_slot_id       UUID,
  p_translator_id UUID
) RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_slot       RECORD;
  v_translator RECORD;
  v_new_end    TIME;
  v_conflict   INT;
BEGIN
  -- Lock slot
  SELECT * INTO v_slot FROM public.booking_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'slot_not_found'::TEXT; RETURN;
  END IF;

  -- Validate slot is claimable
  IF v_slot.session_type != 'natalia_solo' THEN
    RETURN QUERY SELECT false, 'slot_not_natalia_solo'::TEXT; RETURN;
  END IF;
  IF v_slot.status != 'available' THEN
    RETURN QUERY SELECT false, ('slot_status_' || v_slot.status)::TEXT; RETURN;
  END IF;
  IF v_slot.translator_locked THEN
    RETURN QUERY SELECT false, 'slot_translator_locked'::TEXT; RETURN;
  END IF;
  IF v_slot.translator_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'slot_already_claimed'::TEXT; RETURN;
  END IF;
  IF v_slot.locale != 'pl' THEN
    RETURN QUERY SELECT false, 'slot_not_pl'::TEXT; RETURN;
  END IF;

  -- Validate translator
  SELECT id, role, is_active, locale INTO v_translator
    FROM public.staff_members
    WHERE id = p_translator_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'translator_not_found'::TEXT; RETURN;
  END IF;
  IF v_translator.role != 'translator' THEN
    RETURN QUERY SELECT false, 'not_a_translator'::TEXT; RETURN;
  END IF;
  IF NOT v_translator.is_active THEN
    RETURN QUERY SELECT false, 'translator_inactive'::TEXT; RETURN;
  END IF;
  IF v_translator.locale NOT IN ('en','de','pt') THEN
    RETURN QUERY SELECT false, 'translator_invalid_locale'::TEXT; RETURN;
  END IF;

  -- Compute new end_time (interpreter_solo = 180 min)
  v_new_end := (v_slot.start_time + interval '180 minutes')::time;

  -- Conflict check: does extending by 60min overlap any other active slot?
  -- (start_time < new_end AND end_time > this.start_time, excluding self)
  SELECT COUNT(*) INTO v_conflict
    FROM public.booking_slots
    WHERE id != p_slot_id
      AND slot_date = v_slot.slot_date
      AND status IN ('available','held','booked')
      AND start_time < v_new_end
      AND end_time > v_slot.start_time;
  IF v_conflict > 0 THEN
    RETURN QUERY SELECT false, 'conflict_extending_end_time'::TEXT; RETURN;
  END IF;

  -- Apply claim
  UPDATE public.booking_slots
  SET session_type  = 'natalia_interpreter_solo',
      translator_id = p_translator_id,
      locale        = v_translator.locale,
      end_time      = v_new_end,
      updated_at    = now()
  WHERE id = p_slot_id;

  RETURN QUERY SELECT true, 'claimed'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 2. release_translator_slot ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_translator_slot(
  p_slot_id       UUID,
  p_translator_id UUID
) RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_slot RECORD;
BEGIN
  SELECT * INTO v_slot FROM public.booking_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'slot_not_found'::TEXT; RETURN;
  END IF;

  -- Only the claiming translator can release, and only if slot is still available
  -- (not booked/held — booking means user already committed). Original natalia_solo
  -- slots with no translator_id go through a different release path.
  IF v_slot.translator_id IS NULL THEN
    RETURN QUERY SELECT false, 'slot_not_claimed'::TEXT; RETURN;
  END IF;
  IF v_slot.translator_id != p_translator_id THEN
    RETURN QUERY SELECT false, 'not_your_slot'::TEXT; RETURN;
  END IF;
  IF v_slot.session_type != 'natalia_interpreter_solo' THEN
    RETURN QUERY SELECT false, ('cannot_release_' || v_slot.session_type)::TEXT; RETURN;
  END IF;
  IF v_slot.status != 'available' THEN
    RETURN QUERY SELECT false, ('slot_status_' || v_slot.status)::TEXT; RETURN;
  END IF;

  -- Revert to natalia_solo PL defaults. end_time back to 120 min.
  UPDATE public.booking_slots
  SET session_type  = 'natalia_solo',
      translator_id = NULL,
      locale        = 'pl',
      end_time      = (v_slot.start_time + interval '120 minutes')::time,
      updated_at    = now()
  WHERE id = p_slot_id;

  RETURN QUERY SELECT true, 'released'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 3. Grants ─────────────────────────────────────────────────────────────

-- Callable from authenticated context (server routes use the session user's JWT
-- and resolve translator identity from staff_members before invoking).
GRANT EXECUTE ON FUNCTION public.claim_translator_slot(UUID, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_translator_slot(UUID, UUID) TO authenticated;
