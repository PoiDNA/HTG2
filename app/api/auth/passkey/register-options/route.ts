import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { rpName, getRpIDForHost } from '@/lib/webauthn/config';
import { signChallenge, CHALLENGE_COOKIE_NAME } from '@/lib/webauthn/challenge';

/**
 * GET /api/auth/passkey/register-options
 * Generate WebAuthn registration options for an authenticated user.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch existing credentials to exclude (prevent re-registering same authenticator)
  const { data: existing } = await supabase
    .from('passkey_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  let rpID: string;
  try {
    rpID = getRpIDForHost(host);
  } catch (err: any) {
    if (err.message?.includes('Missing required env var')) {
      return NextResponse.json({ error: 'Passkeys not configured' }, { status: 501 });
    }
    throw err;
  }

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
