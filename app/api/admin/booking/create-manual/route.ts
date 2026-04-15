import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG, isInterpreterSessionType } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

/**
 * POST /api/admin/booking/create-manual
 * Body: { userId, sessionType, slotDate, startTime, endTime?, paymentStatus,
 *         topics?, assistantId?, translatorId? }
 * Creates a booking_slot + booking. Admin only.
 * Bypasses availability_rules — "tu i teraz" override path. is_extra=true.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const {
    userId, sessionType, slotDate, startTime, endTime, paymentStatus, topics,
    assistantId, translatorId, translatorSlug,
  } = await req.json();

  if (!userId || !sessionType || !slotDate || !startTime) {
    return NextResponse.json({ error: 'userId, sessionType, slotDate, startTime required' }, { status: 400 });
  }

  const config = SESSION_CONFIG[sessionType as SessionType];
  if (!config) {
    return NextResponse.json({ error: `Unknown sessionType: ${sessionType}` }, { status: 400 });
  }

  // Derive end time if not provided — use SESSION_CONFIG duration (not hardcoded 90).
  const startNorm = startTime.length === 5 ? startTime + ':00' : startTime;
  let endNorm = endTime ? (endTime.length === 5 ? endTime + ':00' : endTime) : null;
  if (!endNorm) {
    const [h, m] = startTime.split(':').map(Number);
    const totalMin = h * 60 + m + config.durationMinutes;
    endNorm = `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}:00`;
  }

  // Resolve translator — accept either translatorId (UUID) or translatorSlug.
  let resolvedTranslatorId: string | null = translatorId || null;
  let interpreterLocale: string | null = null;
  if (!resolvedTranslatorId && translatorSlug) {
    const { data: tBySlug } = await db
      .from('staff_members')
      .select('id, role, locale, is_active')
      .eq('slug', translatorSlug)
      .single();
    if (tBySlug) resolvedTranslatorId = tBySlug.id;
  }
  if (resolvedTranslatorId) {
    const { data: t } = await db
      .from('staff_members')
      .select('role, locale, is_active')
      .eq('id', resolvedTranslatorId)
      .single();
    if (!t || t.role !== 'translator' || !t.is_active) {
      return NextResponse.json({ error: 'Invalid translator' }, { status: 400 });
    }
    interpreterLocale = t.locale;
  }
  // Admin may create interpreter slot without translator (assign later) — interpreterLocale stays NULL.

  // Derive slot locale from translator (if any) or default to PL
  const slotLocale: 'pl' | 'en' | 'de' | 'pt' =
    interpreterLocale === 'en' || interpreterLocale === 'de' || interpreterLocale === 'pt'
      ? interpreterLocale
      : 'pl';

  // Create booking_slot (is_extra=true: manual admin override)
  const { data: slot, error: slotErr } = await db
    .from('booking_slots')
    .insert({
      slot_date: slotDate,
      start_time: startNorm,
      end_time: endNorm,
      session_type: sessionType,
      status: 'booked',
      is_extra: true,
      assistant_id: assistantId || null,
      translator_id: resolvedTranslatorId,
      locale: slotLocale,
    })
    .select('id')
    .single();

  if (slotErr || !slot) return NextResponse.json({ error: slotErr?.message || 'Slot creation failed' }, { status: 500 });

  // Create booking
  const { data: booking, error: bookingErr } = await db
    .from('bookings')
    .insert({
      user_id: userId,
      slot_id: slot.id,
      session_type: sessionType,
      status: 'confirmed',
      payment_status: paymentStatus || 'pending_verification',
      topics: topics || null,
      interpreter_locale: interpreterLocale,
    })
    .select('id')
    .single();

  if (bookingErr || !booking) {
    // Rollback slot
    await db.from('booking_slots').delete().eq('id', slot.id);
    return NextResponse.json({ error: bookingErr?.message || 'Booking creation failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, bookingId: booking.id });
}
