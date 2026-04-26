import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canEditSesje } from '@/lib/staff-config';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth: get the real logged-in user from session cookies
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();

  // Check profile role (admin always allowed)
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  // Check if practitioner (Natalia — role 'practitioner' in staff_members)
  const { data: staffMember } = await db
    .from('staff_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  const isPractitioner = staffMember?.role === 'practitioner';

  if (!isAdmin && !isPractitioner && !canEditSesje(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
