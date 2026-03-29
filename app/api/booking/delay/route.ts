import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isStaffEmail } from '@/lib/roles';

// POST: delay/reschedule a session
// Staff: unlimited delay, user gets notified
// User: max 15 min delay, available 1h before session
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { bookingId, delayMinutes, newStartTime, reason } = await request.json();
    if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

    const admin = createSupabaseServiceRole();
    const staff = isStaffEmail(user.email ?? '');

    // Get booking + slot
    const { data: booking } = await admin
      .from('bookings')
      .select('*, slot:booking_slots(*)')
      .eq('id', bookingId)
      .single();

    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    const slot = Array.isArray(booking.slot) ? booking.slot[0] : booking.slot;
    if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

    // Check permissions
    if (!staff && booking.user_id !== user.id) {
      return NextResponse.json({ error: 'Not your booking' }, { status: 403 });
    }

    // User restrictions: max 15 min, only 1h before session
    if (!staff) {
      if (!delayMinutes || delayMinutes > 15) {
        return NextResponse.json({ error: 'Maksymalne opóźnienie dla klienta: 15 minut' }, { status: 400 });
      }

      const sessionStart = new Date(slot.slot_date + 'T' + slot.start_time);
      const hoursUntil = (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil > 1) {
        return NextResponse.json({ error: 'Zgłoszenie spóźnienia dostępne od 1 godziny przed sesją' }, { status: 400 });
      }
    }

    // Calculate new times
    const oldStart = slot.start_time; // HH:MM:SS
    let newStart: string;
    let newEnd: string;

    if (newStartTime) {
      // Staff provides exact new time
      newStart = newStartTime;
      // Calculate duration from original slot
      const origDuration = timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
      newEnd = minutesToTime(timeToMinutes(newStartTime) + origDuration);
    } else if (delayMinutes) {
      newStart = minutesToTime(timeToMinutes(oldStart) + delayMinutes);
      newEnd = minutesToTime(timeToMinutes(slot.end_time) + delayMinutes);
    } else {
      return NextResponse.json({ error: 'delayMinutes or newStartTime required' }, { status: 400 });
    }

    // Update slot
    await admin.from('booking_slots').update({
      start_time: newStart,
      end_time: newEnd,
      updated_at: new Date().toISOString(),
    }).eq('id', slot.id);

    // Record the delay in booking metadata (for notifications)
    const delayInfo = {
      delayed_by: staff ? 'staff' : 'client',
      delayed_by_email: user.email,
      delay_minutes: delayMinutes || null,
      old_start: oldStart,
      new_start: newStart,
      reason: staff ? (reason || 'Z przyczyn niezależnych') : 'Zgłoszenie spóźnienia przez klienta',
      delayed_at: new Date().toISOString(),
    };

    // Get existing metadata or create new
    const existingTopics = booking.topics || '';
    const delayNote = staff
      ? `\n⏰ Sesja przesunięta na ${newStart.slice(0, 5)} — ${delayInfo.reason}`
      : `\n⏰ Klient zgłosił spóźnienie: ${delayMinutes} min (nowy start: ${newStart.slice(0, 5)})`;

    await admin.from('bookings').update({
      topics: existingTopics + delayNote,
    }).eq('id', bookingId);

    return NextResponse.json({
      success: true,
      newStart,
      newEnd,
      message: staff
        ? `Sesja przesunięta na ${newStart.slice(0, 5)}`
        : `Spóźnienie zgłoszone. Nowy czas rozpoczęcia: ${newStart.slice(0, 5)}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}
