import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slotId, topics } = await request.json();

    if (!slotId) {
      return NextResponse.json({ error: 'slotId required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('reserve_slot', {
      p_slot_id: slotId,
      p_user_id: user.id,
      p_topics: topics || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, booking_id: data });
  } catch (error: any) {
    console.error('Reserve error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
