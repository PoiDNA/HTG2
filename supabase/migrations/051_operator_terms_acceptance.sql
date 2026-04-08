-- ============================================================
-- 051: operator terms acceptance tracking
-- ============================================================
--
-- BACKGROUND
--
-- HTG operators (Natalia + asystenci/asystentki) need to accept the
-- Operator Regulamin (separate from the user-facing Regulamin Sesji HTG).
--
-- Polish law requires us to have a written agreement with every person
-- who co-creates client sessions. Rather than a wet signature at hire
-- time, the agreement is presented as a banner on the staff dashboard
-- (/prowadzacy) — operator reads, clicks "akceptuję", banner disappears.
--
-- We store the timestamp of acceptance directly on the profile so the
-- check is a single, fast lookup on the dashboard render path. Storing
-- on profiles (not staff_members) is intentional: the regulamin binds
-- the human/account, not a particular staff role assignment, and the
-- record must survive a staff_members row being deactivated.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS operator_terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.operator_terms_accepted_at IS
  'Timestamp at which this user accepted the Operator Regulamin shown at /pl/operator-terms. NULL = not yet accepted. Set by POST /api/user/accept-operator-terms.';
