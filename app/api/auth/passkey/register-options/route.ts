import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { rpName, rpID } from '@/lib/webauthn/config';
import { signChallenge, CHALLENGE_COOKIE_NAME } from '@/lib/webauthn/challenge';

/**
 * GET /api/auth/passkey/register-options
 * Generate WebAuthn registration options for an authenticated user.
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch existing credentials to exclude (prevent re-registering same authenticator)
  const { data: existing } = await supabase
    .from('passkey_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email || user.id,
    userDisplayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'User',
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map(cred => ({
      id: cred.credential_id,
      transports: cred.transports as AuthenticatorTransport[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  const response = NextResponse.json(options);
  response.cookies.set(CHALLENGE_COOKIE_NAME, signChallenge(options.challenge), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 300, // 5 minutes
    path: '/',
  });

  return response;
}
