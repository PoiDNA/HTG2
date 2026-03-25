import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

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
      .eq('device_id', deviceId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Stop stream error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
