import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

// GET: fetch settings for the current (effective) assistant
export async function GET() {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staffMember || staffMember.role !== 'operator') {
    return NextResponse.json({ error: 'Not an operator' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();

  const { data: settings } = await db
    .from('pre_session_settings')
    .select('*')
    .eq('staff_member_id', staffMember.id)
    .maybeSingle();

  return NextResponse.json({ staff: staffMember, settings: settings ?? null });
}

// POST: toggle ON/OFF or update settings
export async function POST(request: NextRequest) {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staffMember || staffMember.role !== 'operator') {
    return NextResponse.json({ error: 'Not an operator' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const body = await request.json();
  const { is_enabled, note_for_client } = body;

  // Upsert settings
  const { data: settings, error } = await db
    .from('pre_session_settings')
    .upsert({
      staff_member_id: staffMember.id,
      is_enabled: is_enabled ?? false,
      note_for_client: note_for_client ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'staff_member_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // When enabling: auto-grant eligibility to existing confirmed bookings
  if (is_enabled) {
    await db.rpc('grant_pre_session_to_existing_bookings', {
      p_staff_member_id: staffMember.id,
    });
  }

  return NextResponse.json({ settings });
}
