-- Migration 007: Session sharing + Favorites

-- 1. User favorites (polubieni)
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  favorite_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, favorite_user_id),
  CHECK (user_id != favorite_user_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_target ON public.user_favorites(favorite_user_id);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY fav_own_read ON public.user_favorites FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = favorite_user_id);
CREATE POLICY fav_own_insert ON public.user_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY fav_own_delete ON public.user_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Session sharing config
CREATE TABLE IF NOT EXISTS public.session_sharing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  live_session_id UUID REFERENCES public.live_sessions(id),
  sharing_mode TEXT NOT NULL CHECK (sharing_mode IN ('open', 'favorites', 'invited')),
  invited_emails TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(booking_id)
);

CREATE INDEX IF NOT EXISTS idx_sharing_booking ON public.session_sharing(booking_id);
CREATE INDEX IF NOT EXISTS idx_sharing_live ON public.session_sharing(live_session_id);
CREATE INDEX IF NOT EXISTS idx_sharing_active ON public.session_sharing(is_active) WHERE is_active = true;

ALTER TABLE public.session_sharing ENABLE ROW LEVEL SECURITY;

CREATE POLICY sharing_own_read ON public.session_sharing FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.bookings WHERE id = booking_id AND user_id = auth.uid())
    OR sharing_mode = 'open'
    OR (sharing_mode = 'favorites' AND EXISTS (
      SELECT 1 FROM public.user_favorites uf
      JOIN public.bookings b ON b.id = booking_id
      WHERE uf.favorite_user_id = auth.uid() AND uf.user_id = b.user_id
    ))
    OR (sharing_mode = 'invited' AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email = ANY(invited_emails)
    ))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  );

CREATE POLICY sharing_own_write ON public.session_sharing FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bookings WHERE id = booking_id AND user_id = auth.uid())
  );

CREATE POLICY sharing_own_update ON public.session_sharing FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.bookings WHERE id = booking_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  );

-- 3. Session listeners (who joined)
CREATE TABLE IF NOT EXISTS public.session_listeners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_sharing_id UUID NOT NULL REFERENCES public.session_sharing(id) ON DELETE CASCADE,
  live_session_id UUID NOT NULL REFERENCES public.live_sessions(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE(session_sharing_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_listeners_session ON public.session_listeners(live_session_id);
CREATE INDEX IF NOT EXISTS idx_listeners_user ON public.session_listeners(user_id);

ALTER TABLE public.session_listeners ENABLE ROW LEVEL SECURITY;

CREATE POLICY listeners_read ON public.session_listeners FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  ));
CREATE POLICY listeners_insert ON public.session_listeners FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4. Add sharing_mode to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sharing_mode TEXT DEFAULT NULL;
