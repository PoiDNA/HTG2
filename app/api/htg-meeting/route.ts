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

// GET /api/htg-meeting — list all meetings with stage count
export async function GET() {
  const user = await checkAccess();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data, error } = await db
    .from('htg_meetings')
    .select('*, htg_meeting_stages(count)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/htg-meeting — create new meeting template
export async function POST(req: NextRequest) {
  const user = await checkAccess();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, meeting_type, max_participants, allow_self_register, participant_selection } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 });

  const db = createSupabaseServiceRole();
  const { data, error } = await db
    .from('htg_meetings')
    .insert({
      name: name.trim(),
      meeting_type: meeting_type ?? 'group',
      max_participants: max_participants ?? 12,
      allow_self_register: allow_self_register ?? true,
      participant_selection: participant_selection ?? 'lottery',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
