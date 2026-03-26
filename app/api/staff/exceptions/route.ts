import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';

export async function GET() {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const { data: exceptions, error } = await supabase
    .from('availability_exceptions')
    .select('*')
    .eq('staff_id', staffMember.id)
    .order('exception_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ exceptions });
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const { date, reason } = await request.json();

  if (!date) {
    return NextResponse.json({ error: 'date required' }, { status: 400 });
  }

  const { data: exception, error } = await supabase
    .from('availability_exceptions')
    .insert({
      staff_id: staffMember.id,
      exception_date: date,
      all_day: true,
      reason: reason || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ exception });
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

  // Only allow deleting own exceptions
  const { error } = await supabase
    .from('availability_exceptions')
    .delete()
    .eq('id', id)
    .eq('staff_id', staffMember.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
