import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canEditSesje } from '@/lib/staff-config';

async function authCheck() {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;
  if (!canEditSesje(user.email)) return null;
  return user;
}

// POST — set reschedule proposal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slot_date, start_time } = await request.json();

  if (!slot_date || !/^\d{4}-\d{2}-\d{2}$/.test(slot_date)) {
    return NextResponse.json({ error: 'Invalid slot_date' }, { status: 400 });
  }
  if (!start_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(start_time)) {
    return NextResponse.json({ error: 'Invalid start_time' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();
  const { error } = await db
    .from('bookings')
    .update({
      proposed_slot_date: slot_date,
      proposed_start_time: start_time.length === 5 ? start_time + ':00' : start_time,
      reschedule_status: 'pending',
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — cancel proposal (revert to original)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { error } = await db
    .from('bookings')
    .update({
      proposed_slot_date: null,
      proposed_start_time: null,
      reschedule_status: null,
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
