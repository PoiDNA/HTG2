import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

// GET: list all eligible clients for this assistant
export async function GET() {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staffMember || staffMember.role !== 'operator') {
    return NextResponse.json({ error: 'Not an operator' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();

  const { data: eligibility } = await db
    .from('pre_session_eligibility')
    .select('id, user_id, source_booking_id, is_active, meeting_booked, pre_booking_id, created_at')
    .eq('staff_member_id', staffMember.id)
    .order('created_at', { ascending: false });

  // Enrich with user emails
  const userIds = [...new Set((eligibility || []).map((e: any) => e.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await db.from('profiles').select('id, email, display_name').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const enriched = (eligibility || []).map((e: any) => ({
    ...e,
    user: profileMap.get(e.user_id) || null,
  }));

  return NextResponse.json({ eligibility: enriched });
}

// POST: grant eligibility to a client by email
export async function POST(request: NextRequest) {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staffMember || staffMember.role !== 'operator') {
    return NextResponse.json({ error: 'Not an operator' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const { email } = await request.json();

  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  // Find client by email
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, display_name')
    .eq('email', email.trim().toLowerCase())
    .single();

  if (!profile) {
    return NextResponse.json({ error: `Nie znaleziono użytkownika: ${email}` }, { status: 404 });
  }

  // Grant eligibility (not linked to a specific booking)
  const { data: entry, error } = await db
    .from('pre_session_eligibility')
    .upsert({
      user_id: profile.id,
      staff_member_id: staffMember.id,
      source_booking_id: null,
      granted_by: user.id,
      is_active: true,
    }, { onConflict: 'user_id,staff_member_id,source_booking_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entry, user: profile });
}

// DELETE: revoke eligibility
export async function DELETE(request: NextRequest) {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staffMember || staffMember.role !== 'operator') {
    return NextResponse.json({ error: 'Not an operator' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const { eligibilityId } = await request.json();

  await db
    .from('pre_session_eligibility')
    .update({ is_active: false })
    .eq('id', eligibilityId)
    .eq('staff_member_id', staffMember.id);

  return NextResponse.json({ ok: true });
}
