-- HTG Meeting Templates
CREATE TABLE public.htg_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  meeting_type TEXT DEFAULT 'group',
  max_participants INT DEFAULT 12,
  allow_self_register BOOLEAN DEFAULT true,
  participant_selection TEXT NOT NULL DEFAULT 'lottery'
    CHECK (participant_selection IN ('lottery', 'admin')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.htg_meeting_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.htg_meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.htg_meeting_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.htg_meeting_stages(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.htg_meeting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.htg_meetings(id),
  room_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'active', 'free_talk', 'ended')),
  current_stage_id UUID REFERENCES public.htg_meeting_stages(id),
  current_question_id UUID REFERENCES public.htg_meeting_questions(id),
  current_speaker_id UUID REFERENCES auth.users(id),
  moderator_id UUID REFERENCES auth.users(id),
  all_muted BOOLEAN DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.htg_meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.htg_meeting_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  is_moderator BOOLEAN DEFAULT false,
  hand_raised BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'registered'
    CHECK (status IN ('registered', 'approved', 'joined', 'left')),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  UNIQUE(session_id, user_id)
);

CREATE INDEX idx_htg_meeting_stages_meeting ON public.htg_meeting_stages(meeting_id);
CREATE INDEX idx_htg_meeting_questions_stage ON public.htg_meeting_questions(stage_id);
CREATE INDEX idx_htg_meeting_sessions_meeting ON public.htg_meeting_sessions(meeting_id);
CREATE INDEX idx_htg_meeting_participants_session ON public.htg_meeting_participants(session_id);
CREATE INDEX idx_htg_meeting_participants_user ON public.htg_meeting_participants(user_id);
