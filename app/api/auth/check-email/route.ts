import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/auth/check-email?email=user@example.com
 *
 * Returns { exists: boolean } — whether a profile with this email exists.
 * Used as a UX precheck before signInWithOtp so users get immediate feedback
 * instead of waiting for an email that will never arrive.
 *
 * Uses service-role client to bypass RLS (unauthenticated callers cannot
 * query profiles directly).
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ exists: false });
  }

  const db = createSupabaseServiceRole();
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  return NextResponse.json({ exists: !!data });
}
