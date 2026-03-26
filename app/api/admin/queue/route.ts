import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const { data: entries, error } = await supabase
    .from('acceleration_queue')
    .select(`
      *,
      booking:bookings(
        session_type,
        slot:booking_slots(slot_date, start_time)
      )
    `)
    .in('status', ['waiting', 'offered'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch user emails separately
  const userIds = [...new Set((entries ?? []).map(e => e.user_id))];
  let userMap: Record<string, { email: string; display_name: string }> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .in('id', userIds);

    if (profiles) {
      for (const p of profiles) {
        userMap[p.id] = { email: p.email ?? '', display_name: p.display_name ?? '' };
      }
    }
  }

  const enrichedEntries = (entries ?? []).map(e => ({
    ...e,
    user: userMap[e.user_id] ?? { email: e.user_id, display_name: '' },
  }));

  return NextResponse.json({ entries: enrichedEntries });
}
