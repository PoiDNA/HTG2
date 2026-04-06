-- External invitations: invite friends outside HTG
-- Tracks who invited whom + conversion (registration)

CREATE TABLE public.external_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (email = lower(trim(email))),
  inviter_name TEXT NOT NULL CHECK (char_length(inviter_name) <= 50),
  personal_message TEXT CHECK (char_length(personal_message) <= 250),
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'registered', 'expired')),
  registered_user_id UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  registered_at TIMESTAMPTZ
);

-- One invitation per inviter+email pair (resend = update, not duplicate)
CREATE UNIQUE INDEX uq_inviter_email ON public.external_invitations(inviter_id, email);

-- Fast lookup for post-login conversion check
CREATE INDEX idx_inv_email_status ON public.external_invitations(email, status);

-- Fast lookup for rate limiting (inviter + recent sent_at)
CREATE INDEX idx_inv_inviter_sent ON public.external_invitations(inviter_id, sent_at);

ALTER TABLE public.external_invitations ENABLE ROW LEVEL SECURITY;

-- Users can read their own invitations (for the UI list)
CREATE POLICY inv_own_read ON public.external_invitations
  FOR SELECT USING (auth.uid() = inviter_id);
