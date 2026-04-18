-- Migration 092: Pytania do sesji badawczych
-- =====================================================================
-- Globalna pula pytań od userów "po sesji" (mających wpisany termin
-- sesji: booking confirmed/completed LUB udział w htg_meeting_sessions).
-- Staff widzi i moderuje wszystko. Odpowiedź = podpięty session_fragment
-- (migracja 084) z dowolnej published sesji.
--
-- Komentarze są płaskie (nie wątkowane) — służą uzupełnieniu pytania
-- przez innych uczestników. Blokada dodawania komentarzy po zmianie
-- statusu na "rozpoznane" wymuszona w RLS policy.

-- ---------------------------------------------------------------------
-- 1. Tabela pytań
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  body                TEXT CHECK (body IS NULL OR char_length(body) <= 5000),
  status              TEXT NOT NULL DEFAULT 'oczekujace'
                        CHECK (status IN ('oczekujace', 'rozpoznane')),
  answer_fragment_id  UUID REFERENCES public.session_fragments(id) ON DELETE SET NULL,
  resolved_by         UUID REFERENCES auth.users(id),
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT session_questions_resolved_consistency
    CHECK (
      (status = 'rozpoznane' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
      OR
      (status = 'oczekujace' AND resolved_at IS NULL AND resolved_by IS NULL AND answer_fragment_id IS NULL)
    )
);

CREATE INDEX idx_session_questions_status     ON public.session_questions(status);
CREATE INDEX idx_session_questions_author     ON public.session_questions(author_id);
CREATE INDEX idx_session_questions_fragment   ON public.session_questions(answer_fragment_id) WHERE answer_fragment_id IS NOT NULL;
CREATE INDEX idx_session_questions_created    ON public.session_questions(created_at DESC);

-- ---------------------------------------------------------------------
-- 2. Komentarze (płaskie)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_question_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES public.session_questions(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sqc_question ON public.session_question_comments(question_id, created_at);
CREATE INDEX idx_sqc_author   ON public.session_question_comments(author_id);

-- ---------------------------------------------------------------------
-- 3. Polubienia (unique per user×question)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_question_likes (
  question_id  UUID NOT NULL REFERENCES public.session_questions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, user_id)
);

CREATE INDEX idx_sql_user ON public.session_question_likes(user_id);

-- ---------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.session_questions_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_session_questions_updated_at
  BEFORE UPDATE ON public.session_questions
  FOR EACH ROW EXECUTE FUNCTION public.session_questions_touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. Helpery SQL: czy user jest "po sesji" / staff / admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_po_sesji_access(uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    -- booking z potwierdzonym/zrealizowanym terminem
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.user_id = uid
        AND b.status IN ('confirmed', 'completed')
    )
    OR
    -- udział w grupowej sesji htg (zarejestrowany lub uczestniczył)
    EXISTS (
      SELECT 1 FROM public.htg_meeting_participants p
      WHERE p.user_id = uid
    );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin(uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid
      AND role IN ('admin', 'moderator', 'publikacja', 'translator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 6. Widok z agregatami (likes_count, comments_count) do sortowania
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.session_questions_ranked AS
SELECT
  q.*,
  COALESCE(l.likes_count, 0)       AS likes_count,
  COALESCE(c.comments_count, 0)    AS comments_count
FROM public.session_questions q
LEFT JOIN (
  SELECT question_id, COUNT(*)::INT AS likes_count
  FROM public.session_question_likes
  GROUP BY question_id
) l ON l.question_id = q.id
LEFT JOIN (
  SELECT question_id, COUNT(*)::INT AS comments_count
  FROM public.session_question_comments
  GROUP BY question_id
) c ON c.question_id = q.id;

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.session_questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_question_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_question_likes     ENABLE ROW LEVEL SECURITY;

-- Service role: pełny dostęp (API używa service_role dla operacji admin)
CREATE POLICY service_all_sq      ON public.session_questions         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_all_sqc     ON public.session_question_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_all_sql     ON public.session_question_likes    FOR ALL USING (true) WITH CHECK (true);

-- ─── SELECT ──────────────────────────────────────────────────────────
-- Staff widzi wszystko. User po sesji też widzi wszystko (globalna pula).
CREATE POLICY sq_select_authorized ON public.session_questions
  FOR SELECT TO authenticated
  USING (
    public.is_staff_or_admin(auth.uid())
    OR public.has_po_sesji_access(auth.uid())
  );

CREATE POLICY sqc_select_authorized ON public.session_question_comments
  FOR SELECT TO authenticated
  USING (
    public.is_staff_or_admin(auth.uid())
    OR public.has_po_sesji_access(auth.uid())
  );

CREATE POLICY sql_select_authorized ON public.session_question_likes
  FOR SELECT TO authenticated
  USING (
    public.is_staff_or_admin(auth.uid())
    OR public.has_po_sesji_access(auth.uid())
  );

-- ─── INSERT pytań: user po sesji lub staff, author = self ────────────
CREATE POLICY sq_insert_own ON public.session_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (public.is_staff_or_admin(auth.uid()) OR public.has_po_sesji_access(auth.uid()))
  );

-- ─── INSERT komentarza: blokowany po "rozpoznane" ────────────────────
CREATE POLICY sqc_insert_own ON public.session_question_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (public.is_staff_or_admin(auth.uid()) OR public.has_po_sesji_access(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.session_questions q
      WHERE q.id = question_id AND q.status = 'oczekujace'
    )
  );

-- ─── INSERT / DELETE polubień: user po sesji lub staff, self only ────
CREATE POLICY sql_insert_own ON public.session_question_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.is_staff_or_admin(auth.uid()) OR public.has_po_sesji_access(auth.uid()))
  );

CREATE POLICY sql_delete_own ON public.session_question_likes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── UPDATE pytania: autor (tylko title/body i tylko gdy oczekujace) ──
-- i admin (zmiana statusu + answer_fragment_id). WITH CHECK egzekwuje,
-- że autor nie zmieni statusu — SECURITY kluczem jest że update-any
-- jest tylko dla admina przez service_role lub is_admin().
CREATE POLICY sq_update_author ON public.session_questions
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid() AND status = 'oczekujace'
  )
  WITH CHECK (
    author_id = auth.uid() AND status = 'oczekujace'
  );

CREATE POLICY sq_update_admin ON public.session_questions
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ─── DELETE pytania: autor (tylko oczekujące) lub admin ──────────────
CREATE POLICY sq_delete_author ON public.session_questions
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND status = 'oczekujace');

CREATE POLICY sq_delete_admin ON public.session_questions
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- ─── DELETE komentarza: autor lub admin ──────────────────────────────
CREATE POLICY sqc_delete_own ON public.session_question_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 8. Grant na widok (RLS z bazowych tabel nadal obowiązuje)
-- ---------------------------------------------------------------------
GRANT SELECT ON public.session_questions_ranked TO authenticated;
