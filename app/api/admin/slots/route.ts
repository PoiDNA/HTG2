import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const params = request.nextUrl.searchParams;
  const dateFrom = params.get('date_from');
  const dateTo = params.get('date_to');
  const sessionType = params.get('session_type');
  const status = params.get('status');

  let query = supabase
    .from('booking_slots')
    .select('*, translator:staff_members!booking_slots_translator_id_fkey(id, name, slug, locale)')
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(200);

  if (dateFrom) query = query.gte('slot_date', dateFrom);
  if (dateTo) query = query.lte('slot_date', dateTo);
  if (sessionType) query = query.eq('session_type', sessionType);
  if (status) query = query.eq('status', status);

  const { data: slots, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ slots });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const id = request.nextUrl.searchParams.get('id');
  const action = request.nextUrl.searchParams.get('action');

  if (!id || !action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }

  if (action === 'cancel') {
    const { error } = await supabase
      .from('booking_slots')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (action === 'release') {
    const { error } = await supabase
      .from('booking_slots')
      .update({ status: 'available', held_for_user: null, held_until: null })
      .eq('id', id)
      .eq('status', 'held');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
