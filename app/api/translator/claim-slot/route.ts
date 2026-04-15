import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';

// POST /api/translator/claim-slot
// Body: { slot_id: string }
//
// Authorization: requireStaff + staffMember.role === 'translator'.
// Business logic lives in the claim_translator_slot RPC (migration 082)
// which runs SECURITY DEFINER with FOR UPDATE locking + conflict check.
//
// The RPC verifies that the translator resolved here (p_translator_id) actually
// matches the claim target, so admin impersonation (which returns the impersonated
// staffMember via getEffectiveStaffMember) works correctly — admin claiming on
// behalf of Melania passes Melania's staff_member.id as p_translator_id.
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }
  if (staffMember.role !== 'translator') {
    return NextResponse.json({ error: 'Tylko tłumaczki mogą dopinać się do slotów' }, { status: 403 });
  }

  const { slot_id } = await request.json().catch(() => ({}));
  if (!slot_id || typeof slot_id !== 'string') {
    return NextResponse.json({ error: 'slot_id required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('claim_translator_slot', {
    p_slot_id: slot_id,
    p_translator_id: staffMember.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // RETURNS TABLE(success BOOLEAN, message TEXT) → PostgREST returns array
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    const msg = row?.message ?? 'unknown_error';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json({ success: true, message: row.message });
}
