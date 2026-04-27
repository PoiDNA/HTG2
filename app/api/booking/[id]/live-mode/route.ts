import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canEditSesje } from '@/lib/staff-config';

const VALID_LIVE_MODES = ['requested', 'confirmed_live', 'confirmed_online', null];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!canEditSesje(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { live_mode } = await request.json();

  if (!VALID_LIVE_MODES.includes(live_mode)) {
    return NextResponse.json({ error: 'Invalid live_mode' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();
  const { error } = await db
    .from('bookings')
    .update({ live_mode: live_mode ?? null })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
