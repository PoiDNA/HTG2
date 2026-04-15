import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/admin/booking/reassign-operator
 * Body: { bookingId: string, assistantId: string }
 *
 * Admin-only. Swaps the operator (assistant_id on booking_slots) for an
 * existing booking's slot. Validates target operator's availability via the
 * reassign_operator_on_booking RPC (rules + exceptions + conflicts).
 *
 * Does NOT change session_type — a booking created as natalia_asysta stays as
 * natalia_asysta regardless of which operator is attached.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { bookingId, assistantId } = await req.json().catch(() => ({}));
  if (!bookingId || typeof bookingId !== 'string') {
    return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
  }
  if (!assistantId || typeof assistantId !== 'string') {
    return NextResponse.json({ error: 'assistantId required' }, { status: 400 });
  }

  const { data, error } = await db.rpc('reassign_operator_on_booking', {
    p_booking_id: bookingId,
    p_assistant_id: assistantId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    return NextResponse.json({ error: row?.message ?? 'unknown_error' }, { status: 409 });
  }

  // Return updated assistant info for UI refresh
  const { data: assistant } = await db
    .from('staff_members')
    .select('id, name, slug')
    .eq('id', assistantId)
    .single();

  return NextResponse.json({ success: true, message: row.message, assistant });
}
