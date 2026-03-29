import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// Vercel Cron Job — runs every 5 minutes
// Creates live_sessions for confirmed bookings starting within 30 minutes
// Also expires held slots past their held_until time

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Also allow without auth in development
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createSupabaseServiceRole();

  const results = { sessionsCreated: 0, slotsExpired: 0, errors: [] as string[] };

  try {
    // 1. Create live_sessions for bookings starting within 30 minutes
    const now = new Date();
    const in30min = new Date(now.getTime() + 30 * 60 * 1000);
    const todayStr = now.toISOString().split('T')[0];

    // Find confirmed bookings without live_session_id that start within 30 min
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        id, slot_id, session_type,
        slot:booking_slots(slot_date, start_time, end_time)
      `)
      .eq('status', 'confirmed')
      .is('live_session_id', null);

    if (bookings) {
      for (const booking of bookings) {
        const slot = (booking as any).slot;
        if (!slot) continue;

        const slotDateTime = new Date(slot.slot_date + 'T' + slot.start_time);

        // Create live_session if slot is within 30 minutes from now
        if (slotDateTime <= in30min && slotDateTime > new Date(now.getTime() - 3 * 60 * 60 * 1000)) {
          const roomName = 'htg-live-' + booking.id.slice(0, 8);

          // Check if live_session already exists for this room
          const { data: existing } = await supabase
            .from('live_sessions')
            .select('id')
            .eq('room_name', roomName)
            .maybeSingle();

          if (existing) {
            // Link existing session to booking
            await supabase.from('bookings').update({ live_session_id: existing.id }).eq('id', booking.id);
            continue;
          }

          const { data: live, error } = await supabase
            .from('live_sessions')
            .insert({
              booking_id: booking.id,
              slot_id: booking.slot_id,
              room_name: roomName,
              phase: 'poczekalnia',
            })
            .select('id')
            .single();

          if (error) {
            results.errors.push(`live_session for ${booking.id}: ${error.message}`);
            continue;
          }

          await supabase.from('bookings').update({ live_session_id: live.id }).eq('id', booking.id);
          results.sessionsCreated++;
        }
      }
    }

    // 2. Expire held slots past their held_until time
    const { data: expiredSlots } = await supabase
      .from('booking_slots')
      .update({
        status: 'available',
        held_for_user: null,
        held_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'held')
      .lt('held_until', now.toISOString())
      .select('id');

    results.slotsExpired = expiredSlots?.length ?? 0;

    // Also expire pending bookings
    if (results.slotsExpired > 0) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancelled_at: now.toISOString() })
        .eq('status', 'pending_confirmation')
        .lt('expires_at', now.toISOString());
    }

    return NextResponse.json({
      ok: true,
      ...results,
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      ...results,
    }, { status: 500 });
  }
}
