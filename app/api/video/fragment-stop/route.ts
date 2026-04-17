import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

const FRAGMENT_CONTEXTS = ['fragment_review', 'fragment_radio', 'fragment_recording_review'] as const;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { deviceId } = await request.json();

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId required' }, { status: 400 });
    }

    await supabase
      .from('active_streams')
      .delete()
      .eq('user_id', user.id)
      .eq('device_id', deviceId)
      .in('stream_context', FRAGMENT_CONTEXTS);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Fragment stop error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
