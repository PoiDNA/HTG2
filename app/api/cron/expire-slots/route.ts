import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service role key for cron operations (no user context)
  const supabase = createSupabaseServiceRole();

  const results: Record<string, number> = {};

  try {
    // 1. Expire held booking slots (24h hold expired)
    const { data: expiredSlots } = await supabase.rpc('expire_held_slots');
    results.expired_slots = typeof expiredSlots === 'number' ? expiredSlots : 0;

    // 2. Clean up stale active_streams (no heartbeat for >2 minutes)
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: staleStreams } = await supabase
      .from('active_streams')
      .delete()
      .lt('last_heartbeat', staleThreshold)
      .select('id');
    results.stale_streams_cleaned = staleStreams?.length ?? 0;

    // 3. Acceleration queue expiry is handled by expire_held_slots() RPC above

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    console.error('Cron expire-slots error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}
