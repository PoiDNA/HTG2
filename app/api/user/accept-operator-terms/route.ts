import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isStaffEmail } from '@/lib/roles';

/**
 * POST /api/user/accept-operator-terms
 *
 * Marks the current authenticated user as having accepted the Operator
 * Regulamin (shown at /pl/operator-terms). Sets profiles.operator_terms_accepted_at
 * to now() for the calling user. Idempotent — re-acceptance overwrites the timestamp.
 *
 * Only callers whose email is in STAFF_EMAILS / ADMIN_EMAILS can accept,
 * since the regulamin only applies to operators (Natalia + asystenci/asystentki).
 */
export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isStaffEmail(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const { error } = await db
    .from('profiles')
    .update({
      operator_terms_accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    console.error('[accept-operator-terms] update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
