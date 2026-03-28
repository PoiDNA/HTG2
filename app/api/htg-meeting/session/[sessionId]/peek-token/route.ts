import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { createObserverToken } from '@/lib/live/livekit';

// GET /api/htg-meeting/session/[sessionId]/peek-token
// Returns a hidden observer LiveKit token. Admin + practitioner only.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin       = isAdminEmail(user.email ?? '');
  const isPractitioner = staffMember?.role === 'practitioner';
  if (!isAdmin && !isPractitioner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('id, room_name, status')
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status === 'ended') return NextResponse.json({ error: 'Session already ended' }, { status: 400 });

  // Observer identity uses __obs__ prefix — meeting room clients never render these
  const identity = `__obs__${user.id}`;
  const token = await createObserverToken(identity, session.room_name);

  return NextResponse.json({
    token,
    url: process.env.LIVEKIT_URL,
    sessionId,
    roomName: session.room_name,
  });
}
