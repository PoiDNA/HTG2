import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/roles';
import type { AdmitRequest } from '@/lib/live/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStaffEmail(user.email ?? '')) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const { sessionId } = (await request.json()) as AdmitRequest;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // Fetch session — must be in poczekalnia phase
    const { data: session, error: fetchError } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.phase !== 'poczekalnia') {
      return NextResponse.json(
        { error: `Cannot admit: session is in phase "${session.phase}", expected "poczekalnia"` },
        { status: 400 },
      );
    }

    // Transition to wstep
    const { data: updated, error: updateError } = await supabase
      .from('live_sessions')
      .update({
        phase: 'wstep',
        phase_changed_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ session: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admit error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
