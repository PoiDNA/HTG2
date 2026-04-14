import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { HOLD_HOURS } from '@/lib/booking/constants';
import { sendTranslatorBookingNotification } from '@/lib/email/resend';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const { entry_id } = await request.json();

  if (!entry_id) {
    return NextResponse.json({ error: 'entry_id required' }, { status: 400 });
  }

  // Get the queue entry
  const { data: entry, error: entryErr } = await supabase
    .from('acceleration_queue')
    .select('*, booking:bookings(session_type)')
    .eq('id', entry_id)
    .single();

  if (entryErr || !entry) {
    return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });
  }

  if (entry.status !== 'waiting' && entry.status !== 'offered') {
    return NextResponse.json({ error: 'Entry is not in waiting/offered status' }, { status: 400 });
  }

  const sessionType = entry.session_type;

  // Find the next available slot for this session type
  const today = new Date().toISOString().split('T')[0];
  const { data: availableSlot, error: slotErr } = await supabase
    .from('booking_slots')
    .select('*')
    .eq('session_type', sessionType)
    .eq('status', 'available')
    .gte('slot_date', today)
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .single();

  if (slotErr || !availableSlot) {
    return NextResponse.json({ error: 'No available slots for this session type' }, { status: 404 });
  }

  // Hold the slot for the user
  const heldUntil = new Date(Date.now() + HOLD_HOURS * 60 * 60 * 1000).toISOString();

  const { error: updateSlotErr } = await supabase
    .from('booking_slots')
    .update({
      status: 'held',
      held_for_user: entry.user_id,
      held_until: heldUntil,
    })
    .eq('id', availableSlot.id)
    .eq('status', 'available');

  if (updateSlotErr) {
    return NextResponse.json({ error: updateSlotErr.message }, { status: 500 });
  }

  // Update queue entry
  const { error: updateEntryErr } = await supabase
    .from('acceleration_queue')
    .update({
      status: 'offered',
      offered_slot_id: availableSlot.id,
      offered_at: new Date().toISOString(),
    })
    .eq('id', entry_id);

  if (updateEntryErr) {
    return NextResponse.json({ error: updateEntryErr.message }, { status: 500 });
  }

  // Notify translator if this is an interpreter slot (non-blocking)
  if (availableSlot.translator_id) {
    try {
      const { data: translator } = await supabase
        .from('staff_members')
        .select('name, email')
        .eq('id', availableSlot.translator_id)
        .single();

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, email')
        .eq('id', entry.user_id)
        .single();

      if (translator?.email) {
        const sessionLabel = SESSION_CONFIG[availableSlot.session_type as SessionType]?.label || availableSlot.session_type;
        const dateFormatted = new Date(availableSlot.slot_date + 'T00:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeFormatted = availableSlot.start_time.slice(0, 5);
        const clientName = profile?.display_name || profile?.email?.split('@')[0] || 'Klient';

        await sendTranslatorBookingNotification(translator.email, {
          translatorName: translator.name,
          clientName,
          sessionType: sessionLabel,
          date: dateFormatted,
          time: timeFormatted,
        });
      }
    } catch (emailErr) {
      console.error('Translator acceleration notification failed:', emailErr);
    }
  }

  return NextResponse.json({
    success: true,
    slot: availableSlot,
    held_until: heldUntil,
  });
}
