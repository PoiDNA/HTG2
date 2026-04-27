import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { canEditSesje } from '@/lib/staff-config';

/**
 * POST /api/admin/users/create-guest
 * Body: { email: string, displayName?: string }
 *
 * Creates a new auth user (email_confirm=true, no password) and upserts the
 * profile row. Returns { userId }.
 *
 * Auth: admin or canEditSesje staff only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && !isAdminEmail(user.email ?? '') && !canEditSesje(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, displayName } = await req.json();
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Nieprawidłowy adres e-mail.' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if a profile with this email already exists
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'Użytkownik z tym adresem e-mail już istnieje w systemie.' },
      { status: 409 },
    );
  }

  // Create auth user — email already confirmed, no password needed
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: {
      display_name: displayName?.trim() || null,
    },
  });

  if (createErr || !created?.user) {
    // Duplicate auth user (race condition)
    if (createErr?.message?.includes('already been registered')) {
      return NextResponse.json(
        { error: 'Użytkownik z tym adresem e-mail już istnieje w systemie.' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: createErr?.message || 'Nie udało się utworzyć konta.' },
      { status: 500 },
    );
  }

  const userId = created.user.id;

  // Upsert profile (a DB trigger may have already created it)
  await db.from('profiles').upsert(
    {
      id: userId,
      email: normalizedEmail,
      display_name: displayName?.trim() || null,
    },
    { onConflict: 'id' },
  );

  return NextResponse.json({ userId });
}
