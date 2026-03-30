import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

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
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const { data: staffMember } = await supabase.from('staff_members').select('role').eq('user_id', user.id).eq('is_active', true).maybeSingle();

  const isAdmin = profile?.role === 'admin';
  const isPractitioner = staffMember?.role === 'practitioner';

  if (!isAdmin && !isPractitioner) {
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
