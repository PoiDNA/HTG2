import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const staffId = request.nextUrl.searchParams.get('staff_id');
  if (!staffId) {
    return NextResponse.json({ error: 'staff_id required' }, { status: 400 });
  }

  const { data: exceptions, error } = await supabase
    .from('availability_exceptions')
    .select('*')
    .eq('staff_id', staffId)
    .order('exception_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ exceptions });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const { staff_id, date, reason } = await request.json();

  if (!staff_id || !date) {
    return NextResponse.json({ error: 'staff_id and date required' }, { status: 400 });
  }

  const { data: exception, error } = await supabase
    .from('availability_exceptions')
    .insert({
      staff_id,
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
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('availability_exceptions')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
