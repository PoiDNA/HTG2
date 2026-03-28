import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// GET /api/htg-meeting/session/[id]/recording-check
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ exists: false });

  const db = createSupabaseServiceRole();
  const { data } = await db
    .from('htg_meeting_recordings')
    .select('id')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ exists: !!data });
}
