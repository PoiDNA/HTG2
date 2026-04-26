import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getRpIDForHost } from '@/lib/webauthn/config';
import { signChallenge, CHALLENGE_COOKIE_NAME } from '@/lib/webauthn/challenge';

/**
 * POST /api/auth/passkey/auth-options
 * Generate WebAuthn authentication options (no auth required — this is for login).
 * Uses discoverable credentials (passkeys stored on device).
 */
export async function POST(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try {
    const options = await generateAuthenticationOptions({
      rpID: getRpIDForHost(host),
      userVerification: 'preferred',
      // Empty allowCredentials = discoverable credentials (resident keys)
    });

    const response = NextResponse.json(options);
    response.cookies.set(CHALLENGE_COOKIE_NAME, signChallenge(options.challenge), {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 300,
      path: '/',
    });

    return response;
  } catch (err: any) {
    if (err.message?.includes('Missing required env var')) {
      return NextResponse.json({ error: 'Passkeys not configured' }, { status: 501 });
    }
    throw err;
  }
}
