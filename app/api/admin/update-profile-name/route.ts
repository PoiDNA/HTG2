import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

// POST /api/admin/update-profile-name
// Body: { userId: string, displayName: string }
// Staff-only: updates profiles.display_name for any user
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = isAdminEmail(user.email ?? '');
  const { staffMember } = await getEffectiveStaffMember();
  if (!isAdmin && !staffMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId, displayName } = await req.json();
  if (!userId || typeof displayName !== 'string') {
    return NextResponse.json({ error: 'userId and displayName required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();
  const { error } = await db
    .from('profiles')
    .update({ display_name: displayName.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('Update profile name error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
