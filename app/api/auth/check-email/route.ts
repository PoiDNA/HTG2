import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { STAFF } from '@/lib/staff-config';

/**
 * GET /api/auth/check-email?email=user@example.com
 *
 * Returns { exists: boolean } — whether an account with this email can log in.
 * Used as a UX precheck before signInWithOtp so users get immediate feedback
 * instead of waiting for an email that will never arrive.
 *
 * Source of truth hierarchy:
 * 1. `lib/staff-config.ts` — staff is ALWAYS recognized regardless of DB state.
 *    If a staff member lacks a profile row (trigger didn't fire, manual account
 *    creation, etc.), we still let them try to log in. Their auth account is
 *    expected to exist; if not, `signInWithOtp` will surface the real error.
 * 2. `profiles.email` — for regular users. Populated by `handle_new_user()`
 *    trigger on auth.users INSERT (migration 034).
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ exists: false });
  }

  // 1. Staff-config is the single source of truth for staff — bypass DB lookup.
  //    Fixes edge case where a staff member's profile row is missing or has
  //    NULL email (accounts created before migration 034 / manual provisioning).
  if (STAFF.some(s => s.email.toLowerCase() === email)) {
    return NextResponse.json({ exists: true });
  }

  // 2. For regular users, check profiles.
  const db = createSupabaseServiceRole();
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  return NextResponse.json({ exists: !!data });
}
