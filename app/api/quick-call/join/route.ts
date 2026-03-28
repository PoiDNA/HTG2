import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createLiveKitToken } from '@/lib/live/livekit';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { callId }: { callId: string } = await req.json();
    if (!callId) return NextResponse.json({ error: 'callId required' }, { status: 400 });

    const db = createSupabaseServiceRole();

    // Fetch call
    const { data: call } = await db
      .from('quick_calls')
      .select('id, room_name, status, created_by')
      .eq('id', callId)
      .single();

    if (!call) return NextResponse.json({ error: 'Połączenie nie istnieje' }, { status: 404 });
    if (call.status === 'ended') return NextResponse.json({ error: 'Połączenie zakończone' }, { status: 410 });

    // Check user is a participant (or admin)
    const isAdmin = isAdminEmail(user.email ?? '');
    const isStaff = isStaffEmail(user.email ?? '');

    if (!isAdmin) {
      const { data: participant } = await db
        .from('quick_call_participants')
        .select('id')
        .eq('call_id', callId)
        .eq('user_id', user.id)
        .single();

      if (!participant) return NextResponse.json({ error: 'Brak dostępu do tego połączenia' }, { status: 403 });
    }

    // Mark as joined
    await db
      .from('quick_call_participants')
      .update({ joined_at: new Date().toISOString() })
      .eq('call_id', callId)
      .eq('user_id', user.id)
      .is('joined_at', null);

    // Fetch display name
    const { data: profile } = await db
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const displayName = profile?.display_name ?? user.email ?? user.id;
    const isStaffUser = isAdmin || isStaff;

    const token = await createLiveKitToken(user.id, call.room_name, isStaffUser, displayName);
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? '';

    return NextResponse.json({ token, url: livekitUrl, roomName: call.room_name });
  } catch (e) {
    console.error('[quick-call/join]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
