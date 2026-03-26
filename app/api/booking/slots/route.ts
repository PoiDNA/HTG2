import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    const params = request.nextUrl.searchParams;
    const sessionType = params.get('session_type');
    const month = params.get('month'); // YYYY-MM

    if (!month) {
      return NextResponse.json({ error: 'month parameter required (YYYY-MM)' }, { status: 400 });
    }

    // Expire any held slots that have passed their held_until
    await supabase
      .from('booking_slots')
      .update({ status: 'available', held_for_user: null, held_until: null })
      .eq('status', 'held')
      .lt('held_until', new Date().toISOString());

    // Fetch available slots for the month
    const dateFrom = `${month}-01`;
    const [year, mon] = month.split('-').map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;

    let query = supabase
      .from('booking_slots')
      .select('id, session_type, slot_date, start_time, end_time, status')
      .eq('status', 'available')
      .gte('slot_date', dateFrom)
      .lte('slot_date', dateTo)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (sessionType) {
      query = query.eq('session_type', sessionType);
    }

    const { data: slots, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group slots by date
    const grouped: Record<string, typeof slots> = {};
    for (const slot of slots ?? []) {
      if (!grouped[slot.slot_date]) {
        grouped[slot.slot_date] = [];
      }
      grouped[slot.slot_date].push(slot);
    }

    return NextResponse.json({ slots: grouped });
  } catch (error: any) {
    console.error('Slots fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
