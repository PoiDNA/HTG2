import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ calls: [] });

    const db = createSupabaseServiceRole();

    // Find active calls for this user
    const { data: myParticipations } = await db
      .from('quick_call_participants')
      .select('call_id')
      .eq('user_id', user.id);

    if (!myParticipations?.length) return NextResponse.json({ calls: [] });

    const callIds = myParticipations.map(p => p.call_id);

    const { data: calls } = await db
      .from('quick_calls')
      .select('id, created_by, room_name, status, created_at')
      .in('id', callIds)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!calls?.length) return NextResponse.json({ calls: [] });

    // Fetch participants for each call
    const { data: allParticipants } = await db
      .from('quick_call_participants')
      .select('call_id, user_id, display_name, email, joined_at')
      .in('call_id', callIds);

    // Fetch initiator profiles
    const creatorIds = [...new Set(calls.map(c => c.created_by))];
    const { data: creatorProfiles } = await db
      .from('profiles')
      .select('id, display_name, email')
      .in('id', creatorIds);

    const creatorMap = new Map(
      (creatorProfiles ?? []).map(p => [p.id, p.display_name ?? p.email ?? 'Nieznany']),
    );

    const result = calls.map(call => ({
      ...call,
      creatorName: creatorMap.get(call.created_by) ?? 'Nieznany',
      isCreator: call.created_by === user.id,
      participants: (allParticipants ?? [])
        .filter(p => p.call_id === call.id)
        .map(p => ({ userId: p.user_id, name: p.display_name ?? p.email, joinedAt: p.joined_at })),
    }));

    return NextResponse.json({ calls: result });
  } catch (e) {
    console.error('[quick-call/active]', e);
    return NextResponse.json({ calls: [] });
  }
}
