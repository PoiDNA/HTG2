import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signBunnyUrl, signPrivateCdnUrl } from '@/lib/bunny';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, deviceId } = await request.json();

    if (!sessionId || !deviceId) {
      return NextResponse.json({ error: 'sessionId and deviceId required' }, { status: 400 });
    }

    // Check if user account is blocked
    const db = createSupabaseServiceRole();
    const { data: profile } = await db
      .from('profiles')
      .select('is_blocked, blocked_reason')
      .eq('id', user.id)
      .single();

    if (profile?.is_blocked) {
      return NextResponse.json({
        allowed: false,
        message: 'Dostęp do materiałów został zawieszony. Skontaktuj się z supportem.',
      });
    }

    // Check entitlement
    const { data: entitlement } = await supabase
      .from('entitlements')
      .select('id')
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .gt('valid_until', new Date().toISOString())
      .limit(1)
      .single();

    if (!entitlement) {
      return NextResponse.json({ error: 'No valid entitlement' }, { status: 403 });
    }

    // Check concurrent streams — only 1 device at a time
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString(); // 60s stale threshold
    const { data: activeStreams } = await supabase
      .from('active_streams')
      .select('device_id')
      .eq('user_id', user.id)
      .gt('last_heartbeat', cutoff);

    const otherDeviceActive = activeStreams?.some(s => s.device_id !== deviceId);

    if (otherDeviceActive) {
      return NextResponse.json({
        allowed: false,
        message: 'Twoje konto odtwarza już materiał na innym urządzeniu. Zatrzymaj odtwarzanie tam, aby rozpocząć tutaj.',
      });
    }

    // Register this stream
    await supabase
      .from('active_streams')
      .upsert({
        user_id: user.id,
        device_id: deviceId,
        session_id: sessionId,
        last_heartbeat: new Date().toISOString(),
      }, { onConflict: 'user_id,device_id' });

    // Get video details
    const { data: session } = await supabase
      .from('session_templates')
      .select('bunny_video_id, bunny_library_id')
      .eq('id', sessionId)
      .single();

    if (!session?.bunny_video_id) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Determine URL type: Bunny Stream (HLS) or Storage CDN (direct file)
    // If bunny_library_id is set → Bunny Stream Video (HLS playlist)
    // If bunny_video_id looks like a CDN path (contains /) → Storage file
    let url: string;
    let expiresIn: number;

    if (session.bunny_library_id) {
      // Bunny Stream Video — HLS playlist, 15 min token refresh
      url = signBunnyUrl(session.bunny_video_id, session.bunny_library_id);
      expiresIn = 900;
    } else {
      // Bunny Storage — direct file via private CDN, 4 hour token
      url = signPrivateCdnUrl(session.bunny_video_id, 14400);
      expiresIn = 14400;
    }

    return NextResponse.json({
      allowed: true,
      url,
      expiresIn,
    });
  } catch (error: any) {
    console.error('Video token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
