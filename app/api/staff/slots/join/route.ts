import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';
import { slotEndTime } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

// POST: assistant joins a slot
// Sets assistant_id, changes session_type to natalia_agata or natalia_justyna
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  if (staffMember.role !== 'assistant') {
    return NextResponse.json({ error: 'Tylko asystentki mogą dołączać do terminów' }, { status: 403 });
  }

  const { slotId } = await request.json();

  if (!slotId) {
    return NextResponse.json({ error: 'slotId required' }, { status: 400 });
  }

  // Get the slot — must be available and have no assistant
  const { data: slot } = await supabase
    .from('booking_slots')
    .select('id, status, assistant_id, start_time, session_type')
    .eq('id', slotId)
    .single();

  if (!slot) {
    return NextResponse.json({ error: 'Termin nie znaleziony' }, { status: 404 });
  }

  if (slot.assistant_id) {
    return NextResponse.json({ error: 'Termin ma już przypisaną asystentkę' }, { status: 409 });
  }

  if (slot.status !== 'available') {
    return NextResponse.json({ error: 'Termin nie jest dostępny do dołączenia' }, { status: 409 });
  }

  // Determine new session type based on assistant slug
  let newSessionType: SessionType;
  if (staffMember.slug === 'agata') newSessionType = 'natalia_agata';
  else if (staffMember.slug === 'justyna') newSessionType = 'natalia_justyna';
  else {
    return NextResponse.json({ error: 'Nieznana operatorka' }, { status: 400 });
  }

  const newEndTime = slotEndTime(slot.start_time, newSessionType);

  const { error } = await supabase
    .from('booking_slots')
    .update({
      assistant_id: staffMember.id,
      session_type: newSessionType,
      end_time: newEndTime,
    })
    .eq('id', slotId)
    .is('assistant_id', null)
    .eq('status', 'available');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, session_type: newSessionType });
}
