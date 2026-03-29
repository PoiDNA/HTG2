import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { staffMember, user: authUser } = await getEffectiveStaffMember();

  // Allow practitioner directly
  const isPractitioner = staffMember?.role === 'practitioner';

  if (!isPractitioner) {
    // Fallback: check profiles.role for admin (works even when staffMember is null)
    const profileUserId = staffMember?.user_id ?? authUser?.id;
    if (!profileUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    const db = createSupabaseServiceRole();
    const { data: profile } = await db.from('profiles').select('role').eq('id', profileUserId).single();
    if (!profile || !['admin', 'moderator'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const body = await request.json();
  const { payment_status, payment_comment, session_type } = body;

  if (payment_status && !['confirmed_paid', 'installments', 'partial_payment', 'pending_verification'].includes(payment_status)) {
    return NextResponse.json({ error: 'Invalid payment_status' }, { status: 400 });
  }

  const validSessionTypes = ['natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_para', 'natalia_asysta'];
  if (session_type && !validSessionTypes.includes(session_type)) {
    return NextResponse.json({ error: 'Invalid session_type' }, { status: 400 });
  }

  const supabase = createSupabaseServiceRole();

  const updateData: Record<string, any> = {};
  if (payment_status !== undefined) updateData.payment_status = payment_status;
  if (payment_comment !== undefined) updateData.payment_comment = payment_comment;
  if (session_type !== undefined) updateData.session_type = session_type;

  const { error } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', id);

  // Also update session_type on the booking_slot
  if (session_type && !error) {
    const { data: booking } = await supabase.from('bookings').select('slot_id').eq('id', id).single();
    if (booking?.slot_id) {
      await supabase.from('booking_slots').update({ session_type }).eq('id', booking.slot_id);
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
