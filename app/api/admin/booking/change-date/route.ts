import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/admin/booking/change-date
 * Body: { bookingId: string, slotDate: string } e.g. "2026-04-15"
 * Updates booking_slots.slot_date for the slot linked to this booking.
 * Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { bookingId, slotDate } = await req.json();
  if (!bookingId || !slotDate) return NextResponse.json({ error: 'bookingId and slotDate required' }, { status: 400 });

  const { data: booking } = await db.from('bookings').select('slot_id').eq('id', bookingId).single();
  if (!booking?.slot_id) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

  const { error } = await db
    .from('booking_slots')
    .update({ slot_date: slotDate })
    .eq('id', booking.slot_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
