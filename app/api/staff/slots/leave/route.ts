import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';
import { slotEndTime } from '@/lib/booking/constants';

// POST: assistant leaves a slot
// Clears assistant_id, reverts session_type to natalia_solo
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  if (staffMember.role !== 'operator') {
    return NextResponse.json({ error: 'Tylko operatorki mogą opuszczać terminy' }, { status: 403 });
  }

  const { slotId } = await request.json();

  if (!slotId) {
    return NextResponse.json({ error: 'slotId required' }, { status: 400 });
  }

  // Get the slot — must be assigned to this assistant
  const { data: slot } = await supabase
    .from('booking_slots')
    .select('id, status, assistant_id, start_time')
    .eq('id', slotId)
    .eq('assistant_id', staffMember.id)
    .single();

  if (!slot) {
    return NextResponse.json({ error: 'Termin nie znaleziony lub nie przypisany do Ciebie' }, { status: 404 });
  }

  // Only allow leaving if slot is not booked with an expectation of the assistant
  if (slot.status === 'booked') {
    return NextResponse.json({ error: 'Nie można opuścić zarezerwowanego terminu' }, { status: 409 });
  }

  const newEndTime = slotEndTime(slot.start_time, 'natalia_solo');

  const { error } = await supabase
    .from('booking_slots')
    .update({
      assistant_id: null,
      session_type: 'natalia_solo',
      end_time: newEndTime,
    })
    .eq('id', slotId)
    .eq('assistant_id', staffMember.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
