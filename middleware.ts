import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing, locales } from './i18n-config';

const intlMiddleware = createMiddleware(routing);

// Paths that don't require authentication
const PUBLIC_PATHS = ['/', '/sesje', '/sesje-indywidualne', '/subskrypcje', '/nagrania', '/login', '/privacy', '/terms', '/auth', '/host'];

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

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Skip static assets
  if (pathname.includes('/_next/') || pathname.includes('/favicon.ico') || pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)) {
    return NextResponse.next();
  }

  // Skip auth callback from i18n (no locale prefix needed)
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // ─── PKCE Code Exchange ───────────────────────────────────────
  // If ?code= is present, exchange it for a session BEFORE anything else
  const authCode = searchParams.get('code');
  if (authCode && authCode.length > 20) {
    const locale = getLocaleFromPath(pathname);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/konto`;
    url.searchParams.delete('code');

    const response = NextResponse.redirect(url);

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
      // Redirect to login on failure
      url.pathname = `/${locale}/login`;
      return NextResponse.redirect(url);
    }

    return response;
  }

  // ─── i18n Middleware ──────────────────────────────────────────
  const response = intlMiddleware(request);

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
    return NextResponse.redirect(url);
  }

  // No-cache for protected pages
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
