import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';

export async function GET() {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const { data: rules, error } = await supabase
    .from('availability_rules')
    .select('*')
    .eq('staff_id', staffMember.id)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const { day_of_week, start_time, end_time, solo_only } = await request.json();

  if (day_of_week === undefined || !start_time || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: rule, error } = await supabase
    .from('availability_rules')
    .insert({
      staff_id: staffMember.id,
      day_of_week,
      start_time,
      end_time,
      is_active: true,
      solo_only: solo_only ?? false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  // Only allow deleting own rules
  const { error } = await supabase
    .from('availability_rules')
    .update({ is_active: false })
    .eq('id', id)
    .eq('staff_id', staffMember.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
