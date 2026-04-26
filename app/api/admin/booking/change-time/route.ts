import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canEditSesje } from '@/lib/staff-config';

/**
 * POST /api/admin/booking/change-time
 * Body: { bookingId: string, startTime: string } e.g. "10:30"
 * Updates booking_slots.start_time for the slot linked to this booking.
 * Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && !canEditSesje(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { bookingId, startTime } = await req.json();
  if (!bookingId || !startTime) return NextResponse.json({ error: 'bookingId and startTime required' }, { status: 400 });

  // Normalize to HH:MM:SS
  const normalized = startTime.length === 5 ? startTime + ':00' : startTime;

  // Get slot_id
  const { data: booking } = await db.from('bookings').select('slot_id').eq('id', bookingId).single();
  if (!booking?.slot_id) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

  const { error } = await db
    .from('booking_slots')
    .update({ start_time: normalized })
    .eq('id', booking.slot_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
