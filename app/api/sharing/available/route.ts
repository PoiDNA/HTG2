import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single();
  const userEmail = profile?.email || user.email || '';

  // Get active shared sessions where user has access
  // This query uses RLS policies to filter appropriately
  const { data: sharings } = await supabase
    .from('session_sharing')
    .select(`
      id, sharing_mode, is_active,
      booking:bookings (
        id, user_id, session_type,
        slot:booking_slots ( slot_date, start_time, end_time )
      ),
      live_session:live_sessions ( id, phase, room_name )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (!sharings) return NextResponse.json({ sessions: [] });

  // Filter out own bookings and enrich with owner info
  const enriched = [];
  for (const s of sharings) {
    const booking = s.booking as any;
    if (!booking || booking.user_id === user.id) continue;

    // Get owner display name
    const { data: owner } = await supabase
      .from('profiles')
      .select('display_name, email')
      .eq('id', booking.user_id)
      .single();

    enriched.push({
      sharingId: s.id,
      sharingMode: s.sharing_mode,
      liveSession: s.live_session,
      slot: booking.slot,
      sessionType: booking.session_type,
      owner: {
        name: owner?.display_name || owner?.email?.split('@')[0] || 'Użytkownik',
      },
    });
  }

  return NextResponse.json({ sessions: enriched });
}
