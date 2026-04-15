import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';
import { slotEndTime } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

/**
 * POST /api/staff/slots/swap
 *
 * Assistant transfers their slot to another assistant.
 * The slot changes assistant_id and session_type accordingly.
 * If the new assistant doesn't confirm (future: pending state),
 * the slot stays but is flagged for Natalia.
 *
 * For now: direct swap (instant transfer).
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const { slotId, newAssistantId } = await request.json();

  if (!slotId || !newAssistantId) {
    return NextResponse.json({ error: 'slotId and newAssistantId required' }, { status: 400 });
  }

  // Verify the slot is currently assigned to me
  const { data: slot } = await supabase
    .from('booking_slots')
    .select('id, assistant_id, start_time, session_type, status')
    .eq('id', slotId)
    .single();

  if (!slot) {
    return NextResponse.json({ error: 'Slot nie znaleziony' }, { status: 404 });
  }

  if (slot.assistant_id !== staffMember.id) {
    return NextResponse.json({ error: 'Ten termin nie jest przypisany do Ciebie' }, { status: 403 });
  }

  // Look up new assistant
  const { data: newAssistant } = await supabase
    .from('staff_members')
    .select('id, slug, name, role')
    .eq('id', newAssistantId)
    .eq('is_active', true)
    .single();

  if (!newAssistant || newAssistant.role !== 'operator') {
    return NextResponse.json({ error: 'Nie znaleziono operatorki' }, { status: 404 });
  }

  // Determine new session type
  let newSessionType: SessionType = 'natalia_solo';
  if (newAssistant.slug === 'agata') newSessionType = 'natalia_agata';
  else if (newAssistant.slug === 'justyna') newSessionType = 'natalia_justyna';

  const newEndTime = slotEndTime(slot.start_time.slice(0, 5), newSessionType);

  // Update slot
  const { error } = await supabase
    .from('booking_slots')
    .update({
      assistant_id: newAssistantId,
      session_type: newSessionType,
      end_time: newEndTime,
      notes: `Przekazany z ${staffMember.name} do ${newAssistant.name}`,
    })
    .eq('id', slotId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `Termin przekazany do ${newAssistant.name}`,
    new_session_type: newSessionType,
  });
}
