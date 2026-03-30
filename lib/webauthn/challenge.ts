import { createHmac } from 'crypto';

const SECRET = process.env.WEBAUTHN_CHALLENGE_SECRET || 'dev-secret-change-in-production';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

interface ChallengePayload {
  challenge: string;
  expiresAt: number;
}

/**
 * Sign a challenge and return a cookie value.
 */
export function signChallenge(challenge: string): string {
  const payload: ChallengePayload = {
    challenge,
    expiresAt: Date.now() + MAX_AGE_MS,
  };
  const json = JSON.stringify(payload);
  const signature = createHmac('sha256', SECRET).update(json).digest('hex');
  return `${Buffer.from(json).toString('base64')}.${signature}`;
}

/**
 * Verify a signed challenge cookie. Returns the challenge string or null if invalid/expired.
 */
export function verifyChallenge(cookieValue: string): string | null {
  try {
    const [b64, signature] = cookieValue.split('.');
    if (!b64 || !signature) return null;

    const json = Buffer.from(b64, 'base64').toString('utf-8');
    const expected = createHmac('sha256', SECRET).update(json).digest('hex');

    if (signature !== expected) return null;

    const payload: ChallengePayload = JSON.parse(json);
    if (Date.now() > payload.expiresAt) return null;

    return payload.challenge;
  } catch {
    return null;
  }
}

export const CHALLENGE_COOKIE_NAME = 'webauthn_challenge';
