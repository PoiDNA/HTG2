import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth: use direct session check (getEffectiveStaffMember unreliable in route handlers)
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseServiceRole();

  // isAdminEmail is the source of truth (email-based); profiles.role may lag
  const isAdmin = isAdminEmail(user.email ?? '');

  if (!isAdmin) {
    // Also allow practitioner (Natalia) via staff_members
    const { data: staffMember } = await supabase
      .from('staff_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (staffMember?.role !== 'practitioner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  // Get booking to find slot_id and order_id
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, slot_id, order_id')
    .eq('id', id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Delete child records first (FK constraints without CASCADE)
  await supabase.from('booking_recordings').delete().eq('booking_id', id);
  await supabase.from('live_sessions').delete().eq('booking_id', id);
  await supabase.from('consent_records').delete().eq('booking_id', id);
  await supabase.from('acceleration_queue').delete().eq('booking_id', id);

  // Delete booking
  const { error: bookingDeleteError } = await supabase.from('bookings').delete().eq('id', id);
  if (bookingDeleteError) {
    return NextResponse.json({ error: bookingDeleteError.message }, { status: 500 });
  }

  // Delete slot
  if (booking.slot_id) {
    await supabase.from('booking_slots').delete().eq('id', booking.slot_id);
  }

  // Delete order (if import order, not stripe)
  if (booking.order_id) {
    const { data: order } = await supabase.from('orders').select('source').eq('id', booking.order_id).single();
    if (order && order.source === 'import') {
      await supabase.from('orders').delete().eq('id', booking.order_id);
    }
  }

  return NextResponse.json({ ok: true });
}
