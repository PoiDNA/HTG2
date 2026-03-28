import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/companion/invite
// Body: { bookingId, email, displayName? }
// Creates (or resends) a companion invite for a natalia_para booking
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookingId, email, displayName } = await req.json();
  if (!bookingId || !email) {
    return NextResponse.json({ error: 'bookingId and email required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Verify booking belongs to this user and is natalia_para
  const { data: booking } = await db
    .from('bookings')
    .select('id, user_id, session_type, status')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.session_type !== 'natalia_para') {
    return NextResponse.json({ error: 'Only natalia_para bookings support companions' }, { status: 400 });
  }
  if (!['pending_confirmation', 'confirmed'].includes(booking.status)) {
    return NextResponse.json({ error: 'Booking is not active' }, { status: 400 });
  }

  // Check if companion with this email already exists
  const { data: existing } = await db
    .from('booking_companions')
    .select('id, invite_token, accepted_at')
    .eq('booking_id', bookingId)
    .eq('email', email.toLowerCase())
    .maybeSingle();

  let token: string;

  if (existing) {
    token = existing.invite_token;
  } else {
    // Check max 1 companion per booking
    const { count } = await db
      .from('booking_companions')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId);
    if ((count ?? 0) >= 1) {
      return NextResponse.json({ error: 'Booking already has a companion' }, { status: 409 });
    }

    const { data: newComp } = await db
      .from('booking_companions')
      .insert({
        booking_id: bookingId,
        email: email.toLowerCase(),
        display_name: displayName ?? null,
      })
      .select('invite_token')
      .single();

    token = newComp!.invite_token;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://htg.polidna.pl';
  const acceptUrl = `${baseUrl}/pl/konto/sesje-indywidualne/dolacz-jako-partner/${token}`;

  return NextResponse.json({ token, acceptUrl, alreadyAccepted: !!existing?.accepted_at });
}

// DELETE /api/companion/invite
// Body: { bookingId } — remove companion (booking owner only)
export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookingId } = await req.json();
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  // Verify ownership
  const { data: booking } = await db
    .from('bookings')
    .select('user_id')
    .eq('id', bookingId)
    .single();

  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.from('booking_companions').delete().eq('booking_id', bookingId);

  return NextResponse.json({ removed: true });
}
