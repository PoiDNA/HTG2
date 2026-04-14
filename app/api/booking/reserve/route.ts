import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { sendBookingConfirmation, sendTranslatorBookingNotification } from '@/lib/email/resend';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slotId, topics, paymentMethod, proofPath, proofFilename } = await request.json();

    if (!slotId) {
      return NextResponse.json({ error: 'slotId required' }, { status: 400 });
    }

    // Validate bank transfer params
    if (paymentMethod === 'transfer') {
      if (!proofPath || !proofFilename) {
        return NextResponse.json({ error: 'proofPath and proofFilename required for bank transfer' }, { status: 400 });
      }
      // Anti-IDOR: proof path must start with user's own folder
      const expectedPrefix = `${user.id}/`;
      if (!proofPath.startsWith(expectedPrefix) || !(/^[a-f0-9-]+\/\d+\.\w+$/.test(proofPath))) {
        return NextResponse.json({ error: 'Invalid proof path' }, { status: 400 });
      }
    }

    const { data, error } = await supabase.rpc('reserve_slot', {
      p_slot_id: slotId,
      p_user_id: user.id,
      p_topics: topics || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // For bank transfer: update booking with proof and extend expiry via service role
    if (paymentMethod === 'transfer') {
      const db = createSupabaseServiceRole();
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await db.from('bookings')
        .update({
          payment_status: 'pending_verification',
          transfer_proof_url: proofPath,
          transfer_proof_filename: proofFilename,
          expires_at: sevenDays,
        })
        .eq('id', data);

      await db.from('booking_slots')
        .update({ held_until: sevenDays })
        .eq('id', slotId);

      // TODO: notify admin via email when sendAdminNotification is available
      console.log(`[TRANSFER] New bank transfer booking ${data} — pending verification`);

      return NextResponse.json({ success: true, booking_id: data, paymentMethod: 'transfer' });
    }

    // Send booking confirmation email (non-blocking) — Stripe flow
    try {
      const db = createSupabaseServiceRole();
      const { data: slot } = await db
        .from('booking_slots')
        .select('slot_date, start_time, end_time, session_type, translator_id, translator:staff_members!booking_slots_translator_id_fkey(id, name, email)')
        .eq('id', slotId)
        .single();
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, display_name')
        .eq('id', user.id)
        .single();

      if (slot && profile?.email) {
        const sessionLabel = SESSION_CONFIG[slot.session_type as SessionType]?.label || slot.session_type;
        const dateFormatted = new Date(slot.slot_date + 'T00:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeFormatted = slot.start_time.slice(0, 5);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });

        await sendBookingConfirmation(profile.email, {
          name: profile.display_name || profile.email.split('@')[0],
          sessionType: sessionLabel,
          date: dateFormatted,
          time: timeFormatted,
          expiresAt,
        });

        // Notify translator if this is an interpreter session
        const translator = Array.isArray((slot as any).translator) ? (slot as any).translator[0] : (slot as any).translator;
        if (translator?.email) {
          await sendTranslatorBookingNotification(translator.email, {
            translatorName: translator.name,
            clientName: profile.display_name || profile.email.split('@')[0],
            sessionType: sessionLabel,
            date: dateFormatted,
            time: timeFormatted,
          });
        }
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
