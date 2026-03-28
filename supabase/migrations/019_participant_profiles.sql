-- 019: HTG Participant Profiles + Group Proposals
-- IDEMPOTENT — safe to run multiple times

CREATE TABLE IF NOT EXISTS public.htg_participant_profiles (
  user_id                     UUID  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name                TEXT,
  email                       TEXT,
  score_merytoryczny          FLOAT NOT NULL DEFAULT 5.0,
  score_merytoryczny_override FLOAT,
  score_organizacyjny         FLOAT NOT NULL DEFAULT 5.0,
  score_relacyjny             FLOAT NOT NULL DEFAULT 5.0,
  sessions_total              INT   NOT NULL DEFAULT 0,
  sessions_completed          INT   NOT NULL DEFAULT 0,
  sessions_as_moderator       INT   NOT NULL DEFAULT 0,
  total_speaking_seconds      FLOAT NOT NULL DEFAULT 0,
  avg_speaking_seconds        FLOAT NOT NULL DEFAULT 0,
  unique_groupmates           INT   NOT NULL DEFAULT 0,
  admin_notes                 TEXT,
  last_computed_at            TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.htg_group_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    UUID REFERENCES public.htg_meetings(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  algorithm     TEXT NOT NULL DEFAULT 'stratified_snake',
  group_size_min INT NOT NULL DEFAULT 4,
  group_size_max INT NOT NULL DEFAULT 6,
  groups        JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_htg_profiles_composite ON public.htg_participant_profiles
  ((score_merytoryczny + score_organizacyjny + score_relacyjny));

ALTER TABLE public.htg_participant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.htg_group_proposals      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_profiles"  ON public.htg_participant_profiles;
DROP POLICY IF EXISTS "service_all_proposals" ON public.htg_group_proposals;

CREATE POLICY "service_all_profiles"  ON public.htg_participant_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_proposals" ON public.htg_group_proposals       FOR ALL USING (true) WITH CHECK (true);
