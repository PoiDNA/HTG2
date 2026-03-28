import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

async function checkAccess() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const isAdmin = isAdminEmail(user.email ?? '');
  const { staffMember } = await getEffectiveStaffMember();
  if (!isAdmin && !staffMember) return null;
  return user;
}

// GET /api/htg-meeting/[id] — single meeting with stages + questions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await checkAccess();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = createSupabaseServiceRole();

  const { data: meeting, error } = await db
    .from('htg_meetings')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: stages } = await db
    .from('htg_meeting_stages')
    .select('*, htg_meeting_questions(*)')
    .eq('meeting_id', id)
    .order('order_index');

  return NextResponse.json({ ...meeting, stages: stages ?? [] });
}

// PUT /api/htg-meeting/[id] — update meeting config
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await checkAccess();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, meeting_type, max_participants, allow_self_register, participant_selection, status } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (meeting_type !== undefined) updates.meeting_type = meeting_type;
  if (max_participants !== undefined) updates.max_participants = max_participants;
  if (allow_self_register !== undefined) updates.allow_self_register = allow_self_register;
  if (participant_selection !== undefined) updates.participant_selection = participant_selection;
  if (status !== undefined) updates.status = status;

  const db = createSupabaseServiceRole();
  const { data, error } = await db
    .from('htg_meetings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/htg-meeting/[id] — delete meeting
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await checkAccess();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = createSupabaseServiceRole();

  const { error } = await db.from('htg_meetings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
