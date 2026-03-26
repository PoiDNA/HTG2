import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getRoleForEmail } from '@/lib/roles';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  // Detect locale from 'next' param or default to 'pl'
  const next = searchParams.get('next') ?? '/pl/konto';
  const localeMatch = next.match(/^\/([a-z]{2})(?:\/|$)/);
  const locale = localeMatch ? localeMatch[1] : 'pl';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Auto-set role based on email
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          const expectedRole = getRoleForEmail(user.email);
          if (expectedRole) {
            await supabase
              .from('profiles')
              .update({ role: expectedRole })
              .eq('id', user.id);
          }
        }
      } catch {
        // Non-blocking — role sync may fail if profiles table isn't ready
      }

      // Always redirect to /konto after login
      return NextResponse.redirect(`${origin}/${locale}/konto`);
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_failed`);
}
