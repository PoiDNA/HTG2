import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canEditSesje } from '@/lib/staff-config';

/**
 * POST /api/admin/booking/set-completion
 * Body: { bookingId: string, completionStatus: 'no_show' | 'cancelled_by_htg' | null, completionNotes?: string }
 *
 * Oznacza czy sesja się odbyła:
 *   null              → brak adnotacji (normalny przebieg)
 *   'no_show'         → klient nie stawił się
 *   'cancelled_by_htg' → sesja odwołana przez HTG
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && !canEditSesje(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { bookingId, completionStatus, completionNotes } = await req.json();
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

  const VALID = ['no_show', 'cancelled_by_htg', null];
  if (!VALID.includes(completionStatus)) {
    return NextResponse.json({ error: 'Invalid completionStatus' }, { status: 400 });
  }

  const { error } = await db
    .from('bookings')
    .update({
      completion_status: completionStatus ?? null,
      completion_notes: completionStatus ? (completionNotes?.trim() || null) : null,
    })
    .eq('id', bookingId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
