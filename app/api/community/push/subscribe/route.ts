import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * POST /api/community/push/subscribe
 *
 * Register a Web Push subscription for the current user.
 * Body: { endpoint, keys: { p256dh, auth } }
 */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'endpoint and keys (p256dh, auth) are required' }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from('push_subscriptions')
    .upsert({
      user_id: auth.user.id,
      endpoint,
      keys,
      user_agent: req.headers.get('user-agent') || null,
    }, {
      onConflict: 'user_id,endpoint',
    });

  if (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/community/push/subscribe
 *
 * Unregister a push subscription.
 * Body: { endpoint }
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  await auth.supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('endpoint', endpoint);

  return NextResponse.json({ ok: true });
}
