import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';

// POST /api/translator/release-slot
// Body: { slot_id: string }
//
// Reverts a previously-claimed slot back to natalia_solo/PL, provided:
//   - slot was claimed by THIS translator
//   - slot is still available (no booking held/confirmed against it)
//
// Mechanics delegated to release_translator_slot RPC (migration 082).
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }
  if (staffMember.role !== 'translator') {
    return NextResponse.json({ error: 'Tylko tłumaczki mogą zwalniać sloty' }, { status: 403 });
  }

  const { slot_id } = await request.json().catch(() => ({}));
  if (!slot_id || typeof slot_id !== 'string') {
    return NextResponse.json({ error: 'slot_id required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('release_translator_slot', {
    p_slot_id: slot_id,
    p_translator_id: staffMember.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    const msg = row?.message ?? 'unknown_error';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json({ success: true, message: row.message });
}
