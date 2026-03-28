import { NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { recomputeAllProfiles } from '@/lib/meetings/profiles';

// POST /api/htg-meeting/profiles/recompute
// Recomputes D2 + D3 for all participants from speaking events + attendance data.
export async function POST() {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin       = isAdminEmail(user.email ?? '');
  const isPractitioner = staffMember?.role === 'practitioner';
  if (!isAdmin && !isPractitioner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const count = await recomputeAllProfiles(db);
  return NextResponse.json({ ok: true, count });
}
