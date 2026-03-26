import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

// GET: list slots created by this staff member (extra slots)
export async function GET() {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  // Get slots that match this staff member's session types
  const { data: slots, error } = await supabase
    .from('booking_slots')
    .select('*')
    .eq('is_extra', true)
    .in('session_type', staffMember.session_types)
    .gte('slot_date', new Date().toISOString().split('T')[0])
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ slots });
}

// POST: create a specific date slot (public or private for a user)
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const { date, start_time, end_time, session_type, private_for_email } = await request.json();

  if (!date || !start_time || !end_time || !session_type) {
    return NextResponse.json({ error: 'date, start_time, end_time, session_type required' }, { status: 400 });
  }

  // Validate session type belongs to this staff member
  if (!staffMember.session_types.includes(session_type)) {
    return NextResponse.json({ error: 'Ten typ sesji nie jest przypisany do Ciebie' }, { status: 403 });
  }

  // Check Natalia conflict
  const { data: conflicts } = await supabase
    .from('booking_slots')
    .select('id')
    .eq('slot_date', date)
    .in('status', ['held', 'booked', 'available'])
    .or(`and(start_time.lt.${end_time},end_time.gt.${start_time})`);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: 'Konflikt — istnieje już termin w tym czasie' }, { status: 409 });
  }

  // If private slot — find user by email
  let heldForUser: string | null = null;
  let heldUntil: string | null = null;
  let notes: string | null = null;
  let status = 'available';

  if (private_for_email) {
    // Find user by email
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    // Can't search by email in listUsers easily, use profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('email', private_for_email.toLowerCase())
      .single();

    if (!profile) {
      return NextResponse.json({ error: `Nie znaleziono użytkownika: ${private_for_email}` }, { status: 404 });
    }

    heldForUser = profile.id;
    heldUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days to respond
    notes = `Prywatny termin dla: ${profile.display_name || profile.email}`;
    status = 'held';
  }

  const { data: slot, error } = await supabase
    .from('booking_slots')
    .insert({
      session_type,
      slot_date: date,
      start_time,
      end_time,
      status,
      held_for_user: heldForUser,
      held_until: heldUntil,
      is_extra: true,
      notes,
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
      session_type,
      status: 'pending_confirmation',
      topics: null,
      assigned_at: new Date().toISOString(),
      expires_at: heldUntil,
    });
  }

  return NextResponse.json({ slot });
}

// DELETE: remove a specific slot (only if available or held, not booked)
export async function DELETE(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  // Only delete extra slots that aren't booked
  const { error } = await supabase
    .from('booking_slots')
    .delete()
    .eq('id', id)
    .eq('is_extra', true)
    .in('status', ['available', 'held']);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
