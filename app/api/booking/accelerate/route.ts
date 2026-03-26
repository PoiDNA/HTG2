import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionType, bookingId } = await request.json();

    if (!sessionType) {
      return NextResponse.json({ error: 'sessionType required' }, { status: 400 });
    }

    // Check if user is already in queue for this session type
    const { data: existing } = await supabase
      .from('acceleration_queue')
      .select('id')
      .eq('user_id', user.id)
      .eq('session_type', sessionType)
      .in('status', ['waiting', 'offered'])
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'Already in queue' }, { status: 409 });
    }

    // Get next priority number
    const { data: maxPriority } = await supabase
      .from('acceleration_queue')
      .select('priority')
      .eq('session_type', sessionType)
      .in('status', ['waiting', 'offered'])
      .order('priority', { ascending: false })
      .limit(1);

    const nextPriority = (maxPriority?.[0]?.priority ?? 0) + 1;

    const { data: entry, error } = await supabase
      .from('acceleration_queue')
      .insert({
        user_id: user.id,
        session_type: sessionType,
        booking_id: bookingId || null,
        priority: nextPriority,
        status: 'waiting',
      })
      .select('id, priority')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    console.error('Accelerate error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
