import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing, locales } from './i18n-config';

const intlMiddleware = createMiddleware(routing);

// Paths that don't require authentication
const PUBLIC_PATHS = ['/', '/sesje', '/subskrypcje', '/nagrania', '/login', '/privacy', '/terms', '/auth'];

function isPublicPath(pathname: string): boolean {
  // Strip locale prefix
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';

  return PUBLIC_PATHS.some(p => {
    if (p === '/') return withoutLocale === '/';
    return withoutLocale === p || withoutLocale.startsWith(`${p}/`);
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (pathname.includes('/_next/') || pathname.includes('/favicon.ico') || pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)) {
    return NextResponse.next();
  }

  // Run i18n middleware first
  const response = intlMiddleware(request);

  // For public paths, no auth check needed
  if (isPublicPath(pathname)) {
    return response;
  }

  // For protected paths, check Supabase auth
  let supabaseResponse = response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const localeMatch = pathname.match(/^\/([a-z]{2})(?:\/|$)/);
    const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    return NextResponse.redirect(url);
  }

  // No-cache for protected pages
  supabaseResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  supabaseResponse.headers.set('Pragma', 'no-cache');

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
