import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { rpID, origin } from '@/lib/webauthn/config';
import { verifyChallenge, CHALLENGE_COOKIE_NAME } from '@/lib/webauthn/challenge';

/**
 * POST /api/auth/passkey/auth-verify
 * Verify WebAuthn authentication assertion and create a Supabase session.
 * Body: { response: AuthenticationResponseJSON }
 */
export async function POST(req: NextRequest) {
  const challengeCookie = req.cookies.get(CHALLENGE_COOKIE_NAME)?.value;
  if (!challengeCookie) {
    return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
  }

  const expectedChallenge = verifyChallenge(challengeCookie);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Invalid or expired challenge' }, { status: 400 });
  }

  const { response: authResponse } = await req.json();
  const credentialId = authResponse.id;

  // Look up credential in DB (service role — user isn't authenticated yet)
  const db = createSupabaseServiceRole();
  const { data: credential, error: lookupError } = await db
    .from('passkey_credentials')
    .select('*')
    .eq('credential_id', credentialId)
    .single();

  if (lookupError || !credential) {
    return NextResponse.json({ error: 'Unknown credential' }, { status: 400 });
  }

  // Decode stored public key from base64
  const publicKey = new Uint8Array(Buffer.from(credential.public_key, 'base64'));

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.credential_id,
        publicKey,
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransport[] | undefined,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  // Update counter and last_used_at
  await db
    .from('passkey_credentials')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', credential.id);

  // Get user email to create a Supabase session
  const { data: userData } = await db.auth.admin.getUserById(credential.user_id);
  if (!userData?.user?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 400 });
  }

  // Generate a magic link token for this user (admin API)
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
  });

  if (linkError || !linkData) {
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });
  }

  // Extract token_hash from the generated link and exchange it for a session
  const linkUrl = new URL(linkData.properties.action_link);
  const tokenHash = linkUrl.searchParams.get('token') || linkUrl.hash?.replace('#', '');

  // Create server client that can set cookies on the response
  const jsonResponse = NextResponse.json({ verified: true, redirect: '/konto' });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            jsonResponse.cookies.set(name, value, { ...options, sameSite: 'lax', secure: true });
          });
        },
      },
    }
  );

  // Exchange the token hash for a session
  const hashed_token = linkData.properties.hashed_token;
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: hashed_token,
    type: 'magiclink',
  });

  if (verifyError) {
    return NextResponse.json({ error: 'Session exchange failed' }, { status: 500 });
  }

  jsonResponse.cookies.delete(CHALLENGE_COOKIE_NAME);
  return jsonResponse;
}
