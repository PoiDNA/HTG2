import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

// POST /api/htg-meeting/session/[id]/approve-participant
// Body: { participantId, action: 'approve' | 'reject' }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionId = (await params).id;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = isAdminEmail(user.email ?? '');
  const { staffMember } = await getEffectiveStaffMember();
  if (!isAdmin && !staffMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { participantId, action } = await req.json();
  if (!participantId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'participantId and action required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  if (action === 'approve') {
    await db
      .from('htg_meeting_participants')
      .update({ status: 'approved' })
      .eq('id', participantId)
      .eq('session_id', sessionId);
  } else {
    await db
      .from('htg_meeting_participants')
      .delete()
      .eq('id', participantId)
      .eq('session_id', sessionId);
  }

  return NextResponse.json({ ok: true });
}
