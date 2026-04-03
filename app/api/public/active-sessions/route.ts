import { NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

function shortenName(displayName: string | null): string | undefined {
  if (!displayName) return undefined;
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 0) return undefined;
  const first = parts[0];
  if (parts.length === 1) return first;
  return `${first} ${parts[1][0]}.`;
}

export async function GET() {
  try {
    const db = createSupabaseServiceRole();

    // Compute current date/time in Warsaw timezone
    const warsawNow = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' });
    const [dateStr, timeStr] = warsawNow.split(' ');

    // Query A: Booked slots happening right now
    const { data: activeSlots } = await db
      .from('booking_slots')
      .select('id, session_type')
      .eq('status', 'booked')
      .eq('slot_date', dateStr)
      .lte('start_time', timeStr)
      .gt('end_time', timeStr);

    // For each active slot, get the client name from bookings + profiles
    const individualSessions = [];
    for (const slot of activeSlots ?? []) {
      const sessionType = slot.session_type as SessionType;
      const config = SESSION_CONFIG[sessionType];

      const { data: bookings } = await db
        .from('bookings')
        .select('user_id')
        .eq('slot_id', slot.id)
        .in('status', ['confirmed', 'pending_confirmation'])
        .limit(1);

      let clientName: string | undefined;
      if (bookings?.[0]?.user_id) {
        const { data: profile } = await db
          .from('profiles')
          .select('display_name')
          .eq('id', bookings[0].user_id)
          .single();
        clientName = shortenName(profile?.display_name ?? null);
      }

      individualSessions.push({
        type: 'individual' as const,
        label: config?.label ?? sessionType,
        clientName,
      });
    }

    // Query B: HTG group meetings currently active
    const { data: activeMeetings } = await db
      .from('htg_meeting_sessions')
      .select('id, status, meeting_id')
      .in('status', ['active', 'free_talk']);

    const meetingSessions = [];
    for (const s of activeMeetings ?? []) {
      const { data: meeting } = await db
        .from('htg_meetings')
        .select('name')
        .eq('id', s.meeting_id)
        .single();

      meetingSessions.push({
        type: 'meeting' as const,
        label: meeting?.name ?? 'Spotkanie HTG',
      });
    }

    const sessions = [...individualSessions, ...meetingSessions];

    return NextResponse.json(
      { active: sessions.length > 0, sessions },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        },
      },
    );
  } catch (err) {
    console.error('[active-sessions]', err);
    return NextResponse.json({ active: false, sessions: [] });
  }
}
