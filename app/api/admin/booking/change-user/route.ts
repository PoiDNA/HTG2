import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canEditSesje } from '@/lib/staff-config';

/**
 * POST /api/admin/booking/change-user
 * Body: { bookingId: string, newUserId: string | null }
 * Changes the user assigned to a booking. Pass newUserId=null to free the slot (removes booking).
 * Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && !canEditSesje(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { bookingId, newUserId } = await req.json();
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

  // Free the slot: delete the booking entirely
  if (!newUserId) {
    const { error } = await db.from('bookings').delete().eq('id', bookingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ freed: true });
  }

  // Verify the new user exists
  const { data: newProfile } = await db
    .from('profiles')
    .select('id, email, display_name')
    .eq('id', newUserId)
    .single();

  if (!newProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Reassign the booking
  const { error } = await db
    .from('bookings')
    .update({ user_id: newUserId })
    .eq('id', bookingId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, user: newProfile });
}
