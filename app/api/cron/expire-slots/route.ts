import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service role key for cron operations (no user context)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

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

    // 3. Expire acceleration queue offers (24h)
    const queueThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: expiredQueue } = await supabase
      .from('acceleration_queue')
      .update({ status: 'expired' })
      .eq('status', 'offered')
      .lt('offered_at', queueThreshold)
      .select('id');
    results.expired_queue_offers = expiredQueue?.length ?? 0;

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
