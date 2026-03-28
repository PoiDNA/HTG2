import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSessionReminder } from '@/lib/email/resend';

// GET /api/cron/session-reminders
// Called daily by Vercel Cron (e.g., at 08:00) — sends reminder for sessions tomorrow
// Vercel Cron config in vercel.json: { "crons": [{ "path": "/api/cron/session-reminders", "schedule": "0 8 * * *" }] }
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find confirmed bookings for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { data: bookings } = await db
    .from('bookings')
    .select(`
      id, user_id,
      booking_slots!inner ( slot_date, start_time, session_type ),
      profiles ( email, display_name )
    `)
    .eq('status', 'confirmed')
    .eq('booking_slots.slot_date', tomorrowStr);

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const SESSION_NAMES: Record<string, string> = {
    natalia_solo: 'Sesja 1:1 z Natalią',
    natalia_agata: 'Sesja z Natalią i Agatą',
    natalia_justyna: 'Sesja z Natalią i Justyną',
    natalia_para: 'Sesja dla par z Natalią',
  };

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://htgcyou.com';
  let sent = 0;

  for (const booking of bookings as any[]) {
    const profile = booking.profiles;
    const slot = booking.booking_slots;
    if (!profile?.email || !slot) continue;

    try {
      await sendSessionReminder(profile.email, {
        name: profile.display_name || profile.email.split('@')[0],
        sessionType: SESSION_NAMES[slot.session_type] || slot.session_type,
        date: new Date(slot.slot_date + 'T00:00:00').toLocaleDateString('pl-PL', {
          weekday: 'long', day: 'numeric', month: 'long',
        }),
        time: slot.start_time.slice(0, 5),
        joinUrl: `${baseUrl}/pl/konto/sesje-indywidualne`,
      });
      sent++;
    } catch (err) {
      console.error(`Reminder failed for booking ${booking.id}:`, err);
    }
  }

  return NextResponse.json({ sent, total: bookings.length });
}
