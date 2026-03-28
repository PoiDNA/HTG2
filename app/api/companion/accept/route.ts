import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/companion/accept
// Body: { token } — logged-in user accepts companion invite
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  const { data: companion } = await db
    .from('booking_companions')
    .select('id, booking_id, email, accepted_at')
    .eq('invite_token', token)
    .single();

  if (!companion) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 });

  if (companion.accepted_at) {
    // Already accepted — just return booking id
    return NextResponse.json({ bookingId: companion.booking_id, alreadyAccepted: true });
  }

  // Link to current user
  await db
    .from('booking_companions')
    .update({
      user_id: user.id,
      display_name: (await db.from('profiles').select('display_name').eq('id', user.id).single()).data?.display_name ?? null,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', companion.id);

  return NextResponse.json({ bookingId: companion.booking_id, accepted: true });
}
