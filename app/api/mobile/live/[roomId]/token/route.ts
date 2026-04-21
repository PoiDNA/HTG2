import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createLiveKitToken, createRoom } from '@/lib/live/livekit';
import { isStaffEmail } from '@/lib/roles';
import { requireBearer, jsonError } from '../../../_lib/auth';

export const dynamic = 'force-dynamic';

const TOKEN_TTL = '4h';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  const auth = await requireBearer(req);
  if (auth instanceof NextResponse) return auth;

  const { roomId } = await ctx.params;
  const wsUrl = process.env.LIVEKIT_URL;
  if (!wsUrl) return jsonError('LiveKit not configured', 500);

  const admin = createSupabaseServiceRole();

  const { data: session, error } = await admin
    .from('sessions')
    .select('id, live_room_id, status, required_tier')
    .eq('live_room_id', roomId)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!session) return jsonError('Room not found', 404);
  if (session.status !== 'live' && session.status !== 'scheduled') {
    return jsonError('Room not available', 409);
  }

  const staff = isStaffEmail(auth.user.email ?? '');
  if (!staff && session.required_tier && session.required_tier !== 'free') {
    const { data: sub } = await admin
      .from('stripe_subscriptions')
      .select('id')
      .eq('user_id', auth.user.id)
      .in('status', ['active', 'trialing'])
      .maybeSingle();
    if (!sub) return jsonError('Not entitled', 403);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', auth.user.id)
    .maybeSingle();

  try {
    await createRoom(roomId);
  } catch {
    // Room may already exist — ignore.
  }

  const token = await createLiveKitToken(
    auth.user.id,
    roomId,
    staff,
    profile?.display_name ?? auth.user.email ?? 'Listener',
    { ttl: TOKEN_TTL },
  );

  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  return NextResponse.json({
    wsUrl,
    token,
    roomId,
    identity: auth.user.id,
    expiresAt,
  });
}
