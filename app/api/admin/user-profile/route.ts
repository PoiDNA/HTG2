import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

export async function PATCH(req: NextRequest) {
  const sessionClient = await createSupabaseServer();
  const { data: { user: adminUser } } = await sessionClient.auth.getUser();
  if (!adminUser || !isAdminEmail(adminUser.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { userId, displayName, phone } = await req.json();
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const db = createSupabaseServiceRole();
  const { error } = await db.from('profiles').update({
    display_name: displayName ?? undefined,
    phone: phone ?? undefined,
  }).eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
