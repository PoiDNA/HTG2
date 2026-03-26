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

  const { data: rules, error } = await supabase
    .from('availability_rules')
    .select('*')
    .eq('staff_id', staffId)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const { staff_id, day_of_week, start_time, end_time } = await request.json();

  if (!staff_id || day_of_week === undefined || !start_time || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: rule, error } = await supabase
    .from('availability_rules')
    .insert({ staff_id, day_of_week, start_time, end_time, is_active: true })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule });
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
    .from('availability_rules')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
