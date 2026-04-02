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
        title: 'Konto zablokowane',
        message: 'Dostęp do materiałów został zawieszony. Skontaktuj się z supportem.',
      });
    }

    // Check entitlement
    const now = new Date().toISOString();
    
    // 1. Direct session entitlement (bez zmian)
    const { data: entitlement } = await db
      .from('entitlements').select('id')
      .eq('user_id', user.id).eq('session_id', sessionId)
      .eq('is_active', true).gt('valid_until', now)
      .limit(1).maybeSingle();

    let hasAccess = !!entitlement;

    if (!hasAccess) {
      // 2. Znajdź zestawy tej sesji
      const { data: sessionSets } = await db
        .from('set_sessions')
        .select('set_id, monthly_set:monthly_sets(month_label)')
        .eq('session_id', sessionId);
      const setIds = (sessionSets || []).map(ss => ss.set_id);

      if (setIds.length > 0) {
        // 3. Entitlement z monthly_set_id
        const { data: setEnt } = await db
          .from('entitlements').select('id')
          .eq('user_id', user.id).in('type', ['yearly', 'monthly'])
          .in('monthly_set_id', setIds)
          .eq('is_active', true).gt('valid_until', now)
          .limit(1).maybeSingle();
        hasAccess = !!setEnt;

        // 4. Fallback legacy (monthly_set_id IS NULL + scope_month)
        if (!hasAccess) {
          const setMonths = (sessionSets || [])
            .map(ss => (ss as any).monthly_set?.month_label).filter(Boolean);
          if (setMonths.length > 0) {
            const { data: legacyEnt } = await db
              .from('entitlements').select('id')
              .eq('user_id', user.id).in('type', ['yearly', 'monthly'])
              .is('monthly_set_id', null).in('scope_month', setMonths)
              .eq('is_active', true).gt('valid_until', now)
              .limit(1).maybeSingle();
            hasAccess = !!legacyEnt;
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({
        allowed: false,
        title: 'Brak dostępu',
        message: 'Nie masz aktywnego dostępu do tej sesji.',
      });
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
        title: 'Odtwarzanie na innym urządzeniu',
        message: 'Odtwarzasz już nagranie na innym urządzeniu. Zatrzymaj odtwarzanie tam, aby rozpocząć tutaj.',
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
      return NextResponse.json({
        allowed: false,
        title: 'Nagranie niedostępne',
        message: 'Plik nagrania nie został odnaleziony.',
      });
    }

    // Determine delivery type: Bunny Stream (HLS) or Storage CDN (direct file)
    let url: string;
    let expiresIn: number;
    let deliveryType: 'hls' | 'direct';

    if (session.bunny_library_id) {
      url = signBunnyUrl(session.bunny_video_id, session.bunny_library_id);
      expiresIn = 900;
      deliveryType = 'hls';
    } else {
      url = signPrivateCdnUrl(session.bunny_video_id, 14400);
      expiresIn = 14400;
      deliveryType = 'direct';
    }

    // Guess MIME type for direct files
    let mimeType: string | null = null;
    if (deliveryType === 'direct' && session.bunny_video_id) {
      const ext = session.bunny_video_id.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        'm4a': 'audio/mp4',
        'mp3': 'audio/mpeg',
        'ogg': 'audio/ogg',
        'wav': 'audio/wav',
        'aac': 'audio/aac',
        'webm': 'audio/webm',
        'mp4': 'audio/mp4',   // VOD sessions are audio-first
        'm4v': 'audio/mp4',   // audio in m4v container
        'mov': 'audio/mp4',   // audio in mov container
      };
      mimeType = (ext && mimeMap[ext]) ?? null;
    }

    return NextResponse.json({
      allowed: true,
      url,
      type: deliveryType,           // backward compat for old VideoPlayer
      mediaKind: 'audio' as const,  // VOD sessions are audio-first
      deliveryType,
      mimeType,
      expiresIn,
    });
  } catch (error: any) {
    console.error('Recording token error:', error);
    return NextResponse.json({
      allowed: false,
      title: 'Błąd',
      message: error.message || 'Wystąpił nieoczekiwany błąd.',
    });
  }
}
