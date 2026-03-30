import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { rpID, origin } from '@/lib/webauthn/config';
import { verifyChallenge, CHALLENGE_COOKIE_NAME } from '@/lib/webauthn/challenge';

/**
 * POST /api/auth/passkey/register-verify
 * Verify WebAuthn registration and store credential.
 * Body: { response: RegistrationResponseJSON, friendlyName?: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const challengeCookie = req.cookies.get(CHALLENGE_COOKIE_NAME)?.value;
  if (!challengeCookie) {
    return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
  }

  const expectedChallenge = verifyChallenge(challengeCookie);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Invalid or expired challenge' }, { status: 400 });
  }

  const { response: attResponse, friendlyName } = await req.json();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Store credential in DB
  const { error: dbError } = await supabase.from('passkey_credentials').insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString('base64'),
    counter: credential.counter,
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    transports: credential.transports || [],
    friendly_name: friendlyName || null,
  });

  if (dbError) {
    return NextResponse.json({ error: 'Failed to store credential' }, { status: 500 });
  }

  const res = NextResponse.json({ verified: true });
  res.cookies.delete(CHALLENGE_COOKIE_NAME);
  return res;
}
