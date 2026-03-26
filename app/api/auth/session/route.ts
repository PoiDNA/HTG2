import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// POST /api/auth/session
// Called after client-side OTP verification to sync session cookies server-side
export async function POST(request: NextRequest) {
  try {
    const { access_token, refresh_token } = await request.json();

    if (!access_token || !refresh_token) {
      return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });

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
              response.cookies.set(name, value, {
                ...options,
                // Ensure cookies work across the domain
                sameSite: 'lax',
                secure: true,
              });
            });
          },
        },
      }
    );

    // Set the session server-side — this writes auth cookies
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      console.error('Session sync error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return response;
  } catch (err: any) {
    console.error('Session sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
