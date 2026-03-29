import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

export async function POST(req: NextRequest) {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) {
    return NextResponse.json({ error: 'Brak dostępu' }, { status: 403 });
  }

  const { email, displayName, role, password } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email jest wymagany' }, { status: 400 });

  const db = createSupabaseServiceRole();

  // Create auth user
  const { data: newUser, error: authError } = await db.auth.admin.createUser({
    email,
    password: password || crypto.randomUUID().slice(0, 12) + 'Aa1!',
    email_confirm: true,
    user_metadata: { display_name: displayName || '' },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Upsert profile (trigger may have already created it)
  if (newUser.user) {
    await db.from('profiles').upsert({
      id: newUser.user.id,
      email,
      display_name: displayName || null,
      role: role || 'user',
    }, { onConflict: 'id' });
  }

  return NextResponse.json({ userId: newUser.user?.id });
}
