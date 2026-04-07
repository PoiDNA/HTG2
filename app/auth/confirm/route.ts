import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { getRoleForEmail } from '@/lib/roles';
import { getPortalHome } from '@/lib/portal';
import { locales } from '@/i18n-config';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = (searchParams.get('type') ?? 'email') as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';
  const isLoginFlow = (['email', 'signup', 'magiclink', 'invite'] as string[]).includes(type);

  // Detect locale from 'next' param or default to 'pl'
  const portalHome = getPortalHome(request.headers.get('host'));
  const defaultNext = `/pl${portalHome}`;
  const next = searchParams.get('next') ?? defaultNext;
  const rawLocale = next.match(/^\/([a-z]{2})(?:\/|$)/)?.[1] || 'pl';
  const locale = (locales as readonly string[]).includes(rawLocale) ? rawLocale : 'pl';

  const defaultHome = portalHome;
  // Honor `next` if it's a safe same-origin path; otherwise fall back to defaultHome
  const successPath = (next && next.startsWith('/') && !next.startsWith('//')) ? next : `/${locale}${defaultHome}`;
  const successRedirect = new URL(successPath, origin);
  // Build fail redirect helper — preserves next as returnTo so user lands where they intended
  const safeReturnTo = (next && next.startsWith('/') && !next.startsWith('//') && next !== `/${locale}${defaultHome}`)
    ? next : null;
  function buildFailRedirect(errorType: string): URL {
    const url = new URL(`/${locale}/login`, origin);
    url.searchParams.set('error', errorType);
    if (safeReturnTo) url.searchParams.set('returnTo', safeReturnTo);
    return url;
  }
  const failRedirect = buildFailRedirect('auth_failed');

  if (!code && !tokenHash) {
    // OAuth may return error params when signup is blocked
    const oauthError = searchParams.get('error');
    const oauthErrorDesc = searchParams.get('error_description');
    if (oauthError || oauthErrorDesc) {
      const desc = oauthErrorDesc?.toLowerCase() ?? '';
      const errorType = (desc.includes('signups not allowed') || oauthError === 'access_denied')
        ? 'not_registered' : 'auth_failed';
      return NextResponse.redirect(new URL(`/${locale}/login?error=${errorType}`, origin));
    }
    return NextResponse.redirect(failRedirect);
  }

  // Build redirect response first — cookies must be set on THIS response object
  const response = NextResponse.redirect(successRedirect);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let error = null;

  if (code) {
    // PKCE / OAuth code exchange
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash) {
    // Magic link / email OTP token_hash flow
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  }

  if (error) {
    console.error('Auth confirm error:', error.message);
    const errCode = (error as any).code ?? '';
    const errMsg = error.message?.toLowerCase() ?? '';
    const errorType = (
      errCode === 'otp_disabled' || errCode === 'user_not_found' ||
      errMsg.includes('signups not allowed') || errMsg.includes('user not found')
    ) ? 'not_registered' : 'auth_failed';
    return NextResponse.redirect(buildFailRedirect(errorType));
  }

  // Auto-set role based on email
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const expectedRole = getRoleForEmail(user.email);
      if (expectedRole) {
        await supabase.from('profiles').update({ role: expectedRole }).eq('id', user.id);
      }
    }
  } catch { /* Non-blocking */ }

  // Record GDPR consent for login flows (magic link / SSO / signup)
  // Not recorded for recovery or email_change — those are not new consent acts
  if (isLoginFlow) {
    try {
      await supabase.from('consent_records').insert({
        consent_type: 'sensitive_data',
        granted: true,
        consent_text: 'GDPR Art. 9 consent (via auth redirect)',
      });
    } catch { /* Non-blocking */ }
  }

  // Trigger post-login actions (welcome email, gifts, community join) — non-blocking
  try {
    const postLoginUrl = new URL('/api/auth/post-login', origin);
    // Forward auth cookies to post-login endpoint.
    // verifyOtp sets new session cookies on `response` — merge with request cookies
    // so that post-login receives a valid authenticated session.
    const cookieMap = new Map<string, string>();
    request.cookies.getAll().forEach(c => cookieMap.set(c.name, c.value));
    response.cookies.getAll().forEach(c => cookieMap.set(c.name, c.value)); // response cookies override (newer)
    const cookieHeader = [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

    fetch(postLoginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({ consent: true }),
    }).catch(() => {}); // Fire and forget
  } catch { /* Non-blocking */ }

  return response;
}
