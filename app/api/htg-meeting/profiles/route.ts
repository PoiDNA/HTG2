import { NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

// GET /api/htg-meeting/profiles
// Returns all participant profiles. Admin + practitioner only.
export async function GET() {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin       = isAdminEmail(user.email ?? '');
  const isPractitioner = staffMember?.role === 'practitioner';
  if (!isAdmin && !isPractitioner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const { data, error } = await db
    .from('htg_participant_profiles')
    .select('*')
    .order('sessions_total', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profiles: data ?? [] });
}

// PATCH /api/htg-meeting/profiles  — update D1 score or admin_notes for a user
export async function PATCH(req: Request) {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = isAdminEmail(user.email ?? '');
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { userId, score_merytoryczny_override, admin_notes } = body;
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const db = createSupabaseServiceRole();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (score_merytoryczny_override !== undefined) {
    update.score_merytoryczny_override = score_merytoryczny_override;
    update.score_merytoryczny = score_merytoryczny_override;
  }
  if (admin_notes !== undefined) update.admin_notes = admin_notes;

  const { error } = await db
    .from('htg_participant_profiles')
    .upsert({ user_id: userId, ...update }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
