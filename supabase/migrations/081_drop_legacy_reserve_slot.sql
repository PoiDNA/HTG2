-- Migration 081: drop legacy reserve_slot(uuid, uuid, text) overload
-- =====================================================================================
-- Migration 076 added new optional params (p_session_type, p_assistant_id,
-- p_translator_id, p_end_time) to reserve_slot. Because CREATE OR REPLACE
-- FUNCTION cannot change a function's argument list, PostgreSQL kept the OLD
-- 3-argument signature alongside the NEW 7-argument one.
--
-- Audit in prod (2026-04-15):
--   SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname='reserve_slot';
--   → 2 rows (old + new), both callable.
--
-- Risk: PostgREST / Supabase JS resolves overloads by matching named parameters.
-- A caller passing only {p_slot_id, p_user_id, p_topics} would hit the OLD
-- overload, which lacks advisory locking and pre_reserve_snapshot writes →
-- race conditions between concurrent Stripe holds, and broken slot state
-- reversion on hold expiry (expire_held_slots() relies on snapshot).
--
-- Fix: explicit DROP of the old overload by exact signature. CASCADE is
-- unnecessary because no triggers/views depend on this function (verified:
-- pg_depend for the old oid shows only pg_proc + internal ACL entries).

DROP FUNCTION IF EXISTS public.reserve_slot(
  p_slot_id UUID,
  p_user_id UUID,
  p_topics  TEXT
);

-- Post-check (non-gating; for grep/audit):
-- SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname='reserve_slot';
-- Expected: 1 row with the full signature from migration 076.
