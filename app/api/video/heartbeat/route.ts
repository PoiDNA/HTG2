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

    // Update heartbeat
    await supabase
      .from('active_streams')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('device_id', deviceId);

    // Check if still the only active device
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: activeStreams } = await supabase
      .from('active_streams')
      .select('device_id')
      .eq('user_id', user.id)
      .gt('last_heartbeat', cutoff);

    const otherActive = activeStreams?.some(s => s.device_id !== deviceId);

    return NextResponse.json({ allowed: !otherActive });
  } catch (error: any) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
