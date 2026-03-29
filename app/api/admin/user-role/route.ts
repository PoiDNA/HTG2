import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

/**
 * PATCH /api/admin/user-role
 * Admin changes a user's role.
 */
export async function PATCH(req: NextRequest) {
  const sessionClient = await createSupabaseServer();
  const { data: { user: adminUser } } = await sessionClient.auth.getUser();
  if (!adminUser || !isAdminEmail(adminUser.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { userId, role } = body;

  if (!userId || !role) {
    return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 });
  }

  const validRoles = ['user', 'moderator', 'admin', 'publikacja'];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  const db = createSupabaseServiceRole();
  const { error } = await db
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, role });
}
