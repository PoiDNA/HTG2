import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { staffMember } = await getEffectiveStaffMember();

  if (!staffMember || (staffMember.role !== 'practitioner' && staffMember.slug !== 'admin')) {
    // Check if user is admin
    const admin = createSupabaseServiceRole();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', staffMember?.user_id || '').single();
    if (!profile || !['admin', 'moderator'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const body = await request.json();
  const { payment_status, payment_comment } = body;

  if (payment_status && !['confirmed_paid', 'installments', 'pending_verification'].includes(payment_status)) {
    return NextResponse.json({ error: 'Invalid payment_status' }, { status: 400 });
  }

  const supabase = createSupabaseServiceRole();

  const updateData: Record<string, any> = {};
  if (payment_status !== undefined) updateData.payment_status = payment_status;
  if (payment_comment !== undefined) updateData.payment_comment = payment_comment;

  const { error } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
