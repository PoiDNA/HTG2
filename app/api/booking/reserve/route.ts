import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { sendBookingConfirmation } from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slotId, topics } = await request.json();

    if (!slotId) {
      return NextResponse.json({ error: 'slotId required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('reserve_slot', {
      p_slot_id: slotId,
      p_user_id: user.id,
      p_topics: topics || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Send booking confirmation email (non-blocking)
    try {
      const { data: slot } = await supabase
        .from('booking_slots')
        .select('slot_date, start_time, end_time, session_type')
        .eq('id', slotId)
        .single();
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, display_name')
        .eq('id', user.id)
        .single();

      const SESSION_NAMES: Record<string, string> = {
        natalia_solo: 'Sesja 1:1 z Natalią',
        natalia_agata: 'Sesja z Natalią i Agatą',
        natalia_justyna: 'Sesja z Natalią i Justyną',
        natalia_para: 'Sesja dla par z Natalią',
      };

      if (slot && profile?.email) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
        await sendBookingConfirmation(profile.email, {
          name: profile.display_name || profile.email.split('@')[0],
          sessionType: SESSION_NAMES[slot.session_type] || slot.session_type,
          date: new Date(slot.slot_date + 'T00:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          time: slot.start_time.slice(0, 5),
          expiresAt,
        });
      }
    } catch (emailErr) {
      console.error('Booking confirmation email failed:', emailErr);
    }

    return NextResponse.json({ success: true, booking_id: data });
  } catch (error: any) {
    console.error('Reserve error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
