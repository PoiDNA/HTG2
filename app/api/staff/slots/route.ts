import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';
import { SESSION_CONFIG, slotEndTime, isInterpreterSessionType } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

// GET: list slots based on staff role
// Practitioner (Natalia): all her slots (future)
// Assistant: all Natalia's available slots (to browse/join) + own assigned slots
export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const today = new Date().toISOString().split('T')[0];

  if (staffMember.role === 'practitioner') {
    // Natalia sees all her future slots
    const { data: slots, error } = await supabase
      .from('booking_slots')
      .select(`
        *,
        assistant:staff_members!booking_slots_assistant_id_fkey(id, name, slug, role),
        translator:staff_members!booking_slots_translator_id_fkey(id, name, slug, role, locale)
      `)
      .gte('slot_date', today)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ slots: slots ?? [] });
  }

  // Assistant: get Natalia's available slots (no assistant, not solo_locked) + own assigned slots
  const { data: availableSlots, error: availErr } = await supabase
    .from('booking_slots')
    .select('*')
    .is('assistant_id', null)
    .eq('status', 'available')
    .eq('solo_locked', false)
    .gte('slot_date', today)
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true });

  const { data: mySlots, error: myErr } = await supabase
    .from('booking_slots')
    .select('*')
    .eq('assistant_id', staffMember.id)
    .gte('slot_date', today)
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (availErr || myErr) {
    return NextResponse.json({ error: (availErr || myErr)!.message }, { status: 500 });
  }

  return NextResponse.json({
    availableSlots: availableSlots ?? [],
    mySlots: mySlots ?? [],
  });
}

// POST: create a slot (Natalia/practitioner only, or admin)
// New model: Natalia sets start times, system creates natalia_solo slots
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  // Only practitioners (Natalia) can create slots
  if (staffMember.role !== 'practitioner') {
    return NextResponse.json({ error: 'Tylko prowadząca może tworzyć terminy' }, { status: 403 });
  }

  const {
    date,
    start_time,
    session_type,
    private_for_email,
    solo_locked,
    assistant_id: reqAssistantId,
    translator_id: reqTranslatorId,
  } = await request.json();

  if (!date || !start_time) {
    return NextResponse.json({ error: 'date and start_time required' }, { status: 400 });
  }

  // Determine session type based on assistant
  let finalType: SessionType = session_type || 'natalia_solo';
  let finalAssistantId: string | null = reqAssistantId || null;
  let finalTranslatorId: string | null = reqTranslatorId || null;

  if (finalAssistantId && !session_type) {
    // Look up assistant slug to determine type (PL-only mapping; interpreter flows
    // must pass session_type explicitly).
    const { data: asst } = await supabase.from('staff_members').select('slug').eq('id', finalAssistantId).single();
    if (asst?.slug === 'agata') finalType = 'natalia_agata';
    else if (asst?.slug === 'justyna') finalType = 'natalia_justyna';
  }

  // Interpreter session types require a translator_id
  let slotLocale: 'pl' | 'en' | 'de' | 'pt' = 'pl';
  if (isInterpreterSessionType(finalType)) {
    if (!finalTranslatorId) {
      return NextResponse.json(
        { error: 'translator_id required for interpreter session types' },
        { status: 400 },
      );
    }
    const { data: t } = await supabase
      .from('staff_members')
      .select('role, locale, is_active')
      .eq('id', finalTranslatorId)
      .single();
    if (!t || t.role !== 'translator' || !t.is_active) {
      return NextResponse.json({ error: 'Invalid translator' }, { status: 400 });
    }
    if (t.locale !== 'en' && t.locale !== 'de' && t.locale !== 'pt') {
      return NextResponse.json({ error: 'Translator has invalid locale' }, { status: 400 });
    }
    slotLocale = t.locale;
    if (finalType === 'natalia_interpreter_asysta' && !finalAssistantId) {
      return NextResponse.json(
        { error: 'assistant_id required for natalia_interpreter_asysta' },
        { status: 400 },
      );
    }
  } else if (finalTranslatorId) {
    // Non-interpreter type with translator_id is nonsensical
    return NextResponse.json(
      { error: 'translator_id only valid for interpreter session types' },
      { status: 400 },
    );
  }

  const endTime = slotEndTime(start_time, finalType);

  // Check Natalia conflict
  const { data: conflicts } = await supabase
    .from('booking_slots')
    .select('id')
    .eq('slot_date', date)
    .in('status', ['held', 'booked', 'available'])
    .or(`and(start_time.lt.${endTime},end_time.gt.${start_time})`);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: 'Konflikt — istnieje już termin w tym czasie' }, { status: 409 });
  }

  // If private slot — find user by email
  let heldForUser: string | null = null;
  let heldUntil: string | null = null;
  let notes: string | null = null;
  let status = 'available';

  if (private_for_email) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('email', private_for_email.toLowerCase())
      .single();

    if (!profile) {
      return NextResponse.json({ error: `Nie znaleziono użytkownika: ${private_for_email}` }, { status: 404 });
    }

    heldForUser = profile.id;
    heldUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    notes = `Prywatny termin dla: ${profile.display_name || profile.email}`;
    status = 'held';
  }

  const { data: slot, error } = await supabase
    .from('booking_slots')
    .insert({
      session_type: finalType,
      slot_date: date,
      start_time,
      end_time: endTime,
      status,
      held_for_user: heldForUser,
      held_until: heldUntil,
      is_extra: true,
      notes,
      assistant_id: finalAssistantId,
      translator_id: finalTranslatorId,
      solo_locked: solo_locked ?? false,
      locale: slotLocale,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If private slot, also create a booking entry for the user
  if (heldForUser) {
    await supabase.from('bookings').insert({
      user_id: heldForUser,
      slot_id: slot.id,
      session_type: finalType,
      status: 'pending_confirmation',
      topics: null,
      assigned_at: new Date().toISOString(),
      expires_at: heldUntil,
    });
  }

  return NextResponse.json({ slot });
}

// PATCH: assign/remove assistant on a slot (Natalia/admin only)
export async function PATCH(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  if (staffMember.role !== 'practitioner') {
    return NextResponse.json({ error: 'Tylko prowadząca może zmieniać asystentki' }, { status: 403 });
  }

  const { slot_id, assistant_id } = await request.json();

  if (!slot_id) {
    return NextResponse.json({ error: 'slot_id required' }, { status: 400 });
  }

  // Determine new session type
  let newSessionType: SessionType = 'natalia_solo';
  let newEndTime: string | null = null;

  if (assistant_id) {
    // Look up assistant's slug
    const { data: assistant } = await supabase
      .from('staff_members')
      .select('slug, role')
      .eq('id', assistant_id)
      .eq('is_active', true)
      .single();

    if (!assistant || assistant.role !== 'operator') {
      return NextResponse.json({ error: 'Nie znaleziono operatorki' }, { status: 404 });
    }

    if (assistant.slug === 'agata') newSessionType = 'natalia_agata';
    else if (assistant.slug === 'justyna') newSessionType = 'natalia_justyna';
    else return NextResponse.json({ error: 'Nieznana operatorka' }, { status: 400 });
  }

  // Get current slot to compute new end time
  const { data: slot } = await supabase
    .from('booking_slots')
    .select('start_time')
    .eq('id', slot_id)
    .single();

  if (!slot) {
    return NextResponse.json({ error: 'Slot nie znaleziony' }, { status: 404 });
  }

  newEndTime = slotEndTime(slot.start_time, newSessionType);

  const { error } = await supabase
    .from('booking_slots')
    .update({
      assistant_id: assistant_id || null,
      session_type: newSessionType,
      end_time: newEndTime,
    })
    .eq('id', slot_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, session_type: newSessionType });
}

// DELETE: remove a specific slot (only if available, not booked)
export async function DELETE(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  if (staffMember.role !== 'practitioner') {
    return NextResponse.json({ error: 'Tylko prowadząca może usuwać terminy' }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('booking_slots')
    .delete()
    .eq('id', id)
    .in('status', ['available', 'held']);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
