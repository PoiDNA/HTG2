import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { staffMember } = await getEffectiveStaffMember();

  // Only admin or practitioner can delete
  const supabase = createSupabaseServiceRole();
  let authorized = staffMember?.role === 'practitioner';
  if (!authorized && staffMember?.user_id) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', staffMember.user_id).single();
    authorized = ['admin', 'moderator'].includes(profile?.role || '');
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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

  // Delete booking
  await supabase.from('bookings').delete().eq('id', id);

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
