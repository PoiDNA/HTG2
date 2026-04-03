import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { getRoleForEmail } from '@/lib/roles';
import { isNagraniaPortal, NAGRANIA_HOME } from '@/lib/portal';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = (searchParams.get('type') ?? 'email') as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';
  const consentFromUrl = searchParams.get('consent') === '1';

  // Detect locale from 'next' param or default to 'pl'
  const isNagrania = isNagraniaPortal(request.headers.get('host'));
  const defaultNext = isNagrania ? `/pl${NAGRANIA_HOME}` : '/pl/konto';
  const next = searchParams.get('next') ?? defaultNext;
  const localeMatch = next.match(/^\/([a-z]{2})(?:\/|$)/);
  const locale = localeMatch ? localeMatch[1] : 'pl';

  const defaultHome = isNagrania ? NAGRANIA_HOME : '/konto';
  const successRedirect = new URL(`/${locale}${defaultHome}`, origin);
  const failRedirect = new URL(`/${locale}/login?error=auth_failed`, origin);

  if (!code && !tokenHash) {
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
    return NextResponse.redirect(failRedirect);
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

  // Record GDPR consent if passed via URL (magic link / SSO flow)
  if (consentFromUrl) {
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
    // We need to forward the auth cookies to the post-login endpoint
    const cookieHeader = request.cookies.getAll()
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    fetch(postLoginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({ consent: consentFromUrl }),
    }).catch(() => {}); // Fire and forget
  } catch { /* Non-blocking */ }

  return response;
}
