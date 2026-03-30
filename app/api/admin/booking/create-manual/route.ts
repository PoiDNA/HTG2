import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

/**
 * POST /api/admin/booking/create-manual
 * Body: { userId, sessionType, slotDate, startTime, endTime?, paymentStatus, topics? }
 * Creates a booking_slot + booking. Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId, sessionType, slotDate, startTime, endTime, paymentStatus, topics } = await req.json();

  if (!userId || !sessionType || !slotDate || !startTime) {
    return NextResponse.json({ error: 'userId, sessionType, slotDate, startTime required' }, { status: 400 });
  }

  // Derive end time if not provided (default +90 min)
  const startNorm = startTime.length === 5 ? startTime + ':00' : startTime;
  let endNorm = endTime ? (endTime.length === 5 ? endTime + ':00' : endTime) : null;
  if (!endNorm) {
    const [h, m] = startTime.split(':').map(Number);
    const totalMin = h * 60 + m + 90;
    endNorm = `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}:00`;
  }

  // Create booking_slot
  const { data: slot, error: slotErr } = await db
    .from('booking_slots')
    .insert({
      slot_date: slotDate,
      start_time: startNorm,
      end_time: endNorm,
      session_type: sessionType,
      status: 'booked',
    })
    .select('id')
    .single();

  if (slotErr || !slot) return NextResponse.json({ error: slotErr?.message || 'Slot creation failed' }, { status: 500 });

  // Create booking
  const { data: booking, error: bookingErr } = await db
    .from('bookings')
    .insert({
      user_id: userId,
      slot_id: slot.id,
      session_type: sessionType,
      status: 'confirmed',
      payment_status: paymentStatus || 'pending_verification',
      topics: topics || null,
    })
    .select('id')
    .single();

  if (bookingErr || !booking) {
    // Rollback slot
    await db.from('booking_slots').delete().eq('id', slot.id);
    return NextResponse.json({ error: bookingErr?.message || 'Booking creation failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, bookingId: booking.id });
}
