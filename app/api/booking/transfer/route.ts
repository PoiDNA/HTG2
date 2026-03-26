import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId, newSlotId } = await request.json();

    if (!bookingId || !newSlotId) {
      return NextResponse.json({ error: 'bookingId and newSlotId required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('transfer_booking', {
      p_booking_id: bookingId,
      p_new_slot_id: newSlotId,
      p_user_id: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Transfer error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
