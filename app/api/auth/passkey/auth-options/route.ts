import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rpID } from '@/lib/webauthn/config';
import { signChallenge, CHALLENGE_COOKIE_NAME } from '@/lib/webauthn/challenge';

/**
 * POST /api/auth/passkey/auth-options
 * Generate WebAuthn authentication options (no auth required — this is for login).
 * Uses discoverable credentials (passkeys stored on device).
 */
export async function POST() {
  const options = await generateAuthenticationOptions({
    rpID,
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
}
