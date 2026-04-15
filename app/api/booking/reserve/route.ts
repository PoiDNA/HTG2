import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import {
  sendBookingConfirmation,
  sendTranslatorBookingNotification,
  sendAssistantBookingNotification,
} from '@/lib/email/resend';
import { SESSION_CONFIG, slotEndTime } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      slotId,
      topics,
      paymentMethod,
      proofPath,
      proofFilename,
      sessionType,
      assistantId,
    } = await request.json();

    if (!slotId) {
      return NextResponse.json({ error: 'slotId required' }, { status: 400 });
    }

    // Validate bank transfer params (stripe_pending and default don't need proof)
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

    // Compute end_time server-side (never trust client for duration)
    const db = createSupabaseServiceRole();
    let endTime: string | null = null;
    if (sessionType) {
      const { data: slotRow } = await db
        .from('booking_slots')
        .select('start_time')
        .eq('id', slotId)
        .single();
      if (slotRow?.start_time) {
        endTime = slotEndTime(slotRow.start_time, sessionType as SessionType);
      }
    }

    const { data, error } = await supabase.rpc('reserve_slot', {
      p_slot_id:       slotId,
      p_user_id:       user.id,
      p_topics:        topics || null,
      p_session_type:  sessionType || null,
      p_assistant_id:  assistantId || null,
      p_translator_id: null,
      p_end_time:      endTime,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Extract booking_id — PostgREST RETURNS TABLE gives [{success, message, booking_id}]
    const bookingId: string | null = Array.isArray(data)
      ? (data[0]?.booking_id ?? null)
      : ((data as any)?.booking_id ?? data ?? null);

    if (!bookingId) {
      // RPC returned success=false — extract message
      const msg = Array.isArray(data) ? data[0]?.message : (data as any)?.message;
      return NextResponse.json({ error: msg || 'Slot unavailable' }, { status: 409 });
    }

    // Notify assistant BEFORE paymentMethod-specific early returns
    // (assistant needs to know about upcoming session regardless of payment method)
    if (assistantId) {
      try {
        const { data: assistant } = await db
          .from('staff_members')
          .select('name, email')
          .eq('id', assistantId)
          .single();
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, email')
          .eq('id', user.id)
          .single();

        if (assistant?.email) {
          const sessionLabel = sessionType
            ? (SESSION_CONFIG[sessionType as SessionType]?.label || sessionType)
            : 'Sesja z asystą';
          const { data: slotInfo } = await db
            .from('booking_slots')
            .select('slot_date, start_time')
            .eq('id', slotId)
            .single();
          const dateFormatted = slotInfo
            ? new Date(slotInfo.slot_date + 'T00:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : '';
          const timeFormatted = slotInfo?.start_time?.slice(0, 5) || '';
          const clientName = profile?.display_name || profile?.email?.split('@')[0] || 'Klient';

          await sendAssistantBookingNotification(assistant.email, {
            assistantName: assistant.name,
            clientName,
            sessionType: sessionLabel,
            date: dateFormatted,
            time: timeFormatted,
            pendingPayment: paymentMethod === 'transfer',
          });
        }
      } catch (notifyErr) {
        console.error('Assistant booking notification failed:', notifyErr);
      }
    }

    // For bank transfer: update booking with proof and extend expiry
    if (paymentMethod === 'transfer') {
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await db.from('bookings')
        .update({
          payment_status: 'pending_verification',
          transfer_proof_url: proofPath,
          transfer_proof_filename: proofFilename,
          expires_at: sevenDays,
        })
        .eq('id', bookingId);

      await db.from('booking_slots')
        .update({ held_until: sevenDays })
        .eq('id', slotId);

      console.log(`[TRANSFER] New bank transfer booking ${bookingId} — pending verification`);
      return NextResponse.json({ success: true, booking_id: bookingId, paymentMethod: 'transfer' });
    }

    // For stripe_pending: hold slot, return booking_id — no confirmation email yet
    // (email sent after checkout.session.completed webhook confirms payment)
    if (paymentMethod === 'stripe_pending') {
      return NextResponse.json({ success: true, booking_id: bookingId });
    }

    // Default path (direct confirm, no Stripe): send confirmation email
    try {
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

    return NextResponse.json({ success: true, booking_id: bookingId });
  } catch (error: any) {
    console.error('Reserve error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
