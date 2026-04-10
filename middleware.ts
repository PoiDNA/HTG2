import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing, locales } from './i18n-config';
import { isNagraniaPortal, NAGRANIA_HOME, isSesjaPortal, SESJA_HOME, isAnyPortal, getPortalHome, isPilotSite, PILOT_HOME } from './lib/portal';

const intlMiddleware = createMiddleware(routing);

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/privacy', '/terms', '/auth', '/host', '/host-v2', '/host-v3', '/host-v4', '/pilot'];

function isPublicPath(pathname: string): boolean {
  // Strip locale prefix
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';

  return PUBLIC_PATHS.some(p => {
    if (p === '/') return withoutLocale === '/';
    return withoutLocale === p || withoutLocale.startsWith(`${p}/`);
  });
}

function getLocaleFromPath(pathname: string): string {
  const match = pathname.match(/^\/([a-z]{2})(?:\/|$)/);
  return match ? match[1] : routing.defaultLocale;
}

// Paths allowed on the nagrania.htg.cyou portal (without locale prefix)
const NAGRANIA_ALLOWED = ['/login', '/auth', '/konto/nagrania-sesji', '/konto/zgody', '/privacy', '/terms'];

function isNagraniaAllowed(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  return NAGRANIA_ALLOWED.some(p => withoutLocale === p || withoutLocale.startsWith(`${p}/`));
}

// Paths allowed on the sesja.htg.cyou portal (without locale prefix)
const SESJA_ALLOWED = ['/login', '/auth', '/konto/zgody', '/konto/sesja-panel', '/live', '/privacy', '/terms'];

function isSesjaAllowed(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  return SESJA_ALLOWED.some(p => withoutLocale === p || withoutLocale.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const host = request.headers.get('host');
  const isNagrania = isNagraniaPortal(host);
  const isSesja = isSesjaPortal(host);
  const isPortal = isNagrania || isSesja;

  // Skip static assets
  if (pathname.includes('/_next/') || pathname.includes('/favicon.ico') || pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)) {
    return NextResponse.next();
  }

  // Skip auth callback from i18n — BUT let PKCE code exchange through
  if (pathname.startsWith('/auth/') && !searchParams.get('code')) {
    return NextResponse.next();
  }

  // ─── PKCE Code Exchange ───────────────────────────────────────
  // If ?code= is present (on any path including /auth/confirm), exchange it
  const authCode = searchParams.get('code');
  if (authCode && authCode.length > 20) {
    const nextParam = searchParams.get('next');
    const rawLocale = nextParam?.match(/^\/([a-z]{2})(?:\/|$)/)?.[1] || getLocaleFromPath(pathname);
    const locale = (locales as readonly string[]).includes(rawLocale) ? rawLocale : routing.defaultLocale;
    const portalHome = getPortalHome(host);

    // Defensive: if the code lands on nagrania.htg.cyou but `next` does NOT point to the
    // nagrania-sesji path (or is absent), the user was logging in via htgcyou.com and
    // Supabase fell back to Site URL (htg.cyou → nagrania.htg.cyou).
    // Redirect them to the main site after session exchange instead of keeping them on the portal.
    const isNagraniaNext = !!nextParam?.includes('nagrania-sesji');
    let destUrl: URL;
    if (isNagrania && !isNagraniaNext) {
      const dest = nextParam ?? `/${locale}/konto`;
      destUrl = new URL(`https://htgcyou.com${dest}`);
    } else {
      const url = request.nextUrl.clone();
      url.pathname = nextParam || `/${locale}${portalHome}`;
      url.searchParams.delete('code');
      url.searchParams.delete('next');
      url.searchParams.delete('consent');
      url.searchParams.delete('type');
      destUrl = url;
    }

    const response = NextResponse.redirect(destUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (error) {
      console.error('Code exchange failed:', error.message);
      const errCode = (error as any).code ?? '';
      const errMsg = error.message?.toLowerCase() ?? '';
      const errorType = (
        errCode === 'otp_disabled' || errCode === 'user_not_found' ||
        errMsg.includes('signups not allowed') || errMsg.includes('user not found')
      ) ? 'not_registered' : 'auth_failed';
      // Build clean error redirect — don't clone request URL (would carry ?code=, ?next= as garbage)
      const errUrl = new URL(`${request.nextUrl.origin}/${locale}/login`);
      errUrl.searchParams.set('error', errorType);
      // Preserve nextParam as returnTo so user lands where intended after re-login
      if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
        errUrl.searchParams.set('returnTo', nextParam);
      }
      const errorResponse = NextResponse.redirect(errUrl);
      errorResponse.headers.set('Cache-Control', 'no-store');
      return errorResponse;
    }

    return response;
  }

  // ─── Pilot site route restriction ─────────────────────────────
  const isPilot = isPilotSite(host);
  if (isPilot) {
    const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
    const PILOT_ALLOWED = ['/pilot', '/privacy', '/terms'];
    const isPilotAllowed = PILOT_ALLOWED.some(p => withoutLocale === p || withoutLocale.startsWith(`${p}/`));
    if (!isPilotAllowed || withoutLocale === '/') {
      const locale = getLocaleFromPath(pathname) || routing.defaultLocale;
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}${PILOT_HOME}`;
      return NextResponse.redirect(url);
    }
  }

  // ─── Portal Route Restriction ─────────────────────────────────
  if (isNagrania && !isNagraniaAllowed(pathname)) {
    const locale = getLocaleFromPath(pathname);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${NAGRANIA_HOME}`;
    return NextResponse.redirect(url);
  }
  if (isSesja && !isSesjaAllowed(pathname)) {
    const locale = getLocaleFromPath(pathname);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${SESJA_HOME}`;
    return NextResponse.redirect(url);
  }

  // ─── i18n Middleware ──────────────────────────────────────────
  const response = intlMiddleware(request);

  // ─── Portal: redirect logged-in users from /login to portal home ──
  if (isPortal && isPublicPath(pathname)) {
    const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
    if (withoutLocale === '/login') {
      const supabaseCheck = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options)
              );
            },
          },
        }
      );
      const { data: { user } } = await supabaseCheck.auth.getUser();
      if (user) {
        const locale = getLocaleFromPath(pathname);
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}${getPortalHome(host)}`;
        return NextResponse.redirect(url);
      }
    }
    return response;
  }

  // For public paths, no auth check needed
  if (isPublicPath(pathname)) {
    return response;
  }

  // ─── Auth Check for Protected Routes ─────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const locale = getLocaleFromPath(pathname);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    // Preserve original path as returnTo (pathname only — no query for security)
    const withoutLocaleForReturn = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
    if (withoutLocaleForReturn !== '/' && withoutLocaleForReturn !== '/login') {
      url.searchParams.set('returnTo', withoutLocaleForReturn);
    }
    return NextResponse.redirect(url);
  }

  // ─── Consent Gate for /konto paths ─────────────────────────────
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  const isKontoPath = withoutLocale.startsWith('/konto');
  const isZgodyPath = withoutLocale.startsWith('/konto/zgody');
  const isAdminPath = withoutLocale.startsWith('/konto/admin') || withoutLocale.startsWith('/prowadzacy');

  if (isKontoPath && !isZgodyPath && !isAdminPath) {
    const REQUIRED = ['terms_v3', 'privacy_v3', 'sensitive_data', 'recording_publication'];
    const { data: consents } = await supabase
      .from('consent_records')
      .select('consent_type')
      .eq('user_id', user.id)
      .eq('granted', true);

    const granted = new Set((consents ?? []).map((c: { consent_type: string }) => c.consent_type));
    const missing = REQUIRED.filter(t => !granted.has(t));

    if (missing.length > 0) {
      const locale = getLocaleFromPath(pathname);
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/konto/zgody`;
      return NextResponse.redirect(url);
    }
  }

  // No-cache for protected pages
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
