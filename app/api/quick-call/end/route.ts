import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { callId }: { callId: string } = await req.json();
    if (!callId) return NextResponse.json({ error: 'callId required' }, { status: 400 });

    const db = createSupabaseServiceRole();

    const { data: call } = await db
      .from('quick_calls')
      .select('id, created_by, status')
      .eq('id', callId)
      .single();

    if (!call) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });

    const isAdmin = isAdminEmail(user.email ?? '');
    const isStaff = isStaffEmail(user.email ?? '');
    const isCreator = call.created_by === user.id;

    if (!isAdmin && !isStaff && !isCreator) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    await db
      .from('quick_calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', callId);

    // Mark all participants as left
    await db
      .from('quick_call_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('call_id', callId)
      .is('left_at', null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[quick-call/end]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
