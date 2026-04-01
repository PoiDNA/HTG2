import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// ── Violation thresholds ─────────────────────────────────────────────────────

const THRESHOLDS = {
  IP_DIVERSITY_WARNING:  4,   // distinct IPs per user in 2h  → warning
  IP_DIVERSITY_CRITICAL: 8,   // distinct IPs per user in 2h  → critical
  HIGH_FREQUENCY:        20,  // plays same session in 7 days → warning
  MASS_PLAY_DAY:         10,  // total plays in 1 day         → info
  CONCURRENT_WINDOW_MIN: 30,  // minutes for concurrent countries check
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}
function daysAgo(d: number) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}
function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60 * 1000).toISOString();
}

// ── Violation detection ───────────────────────────────────────────────────────

async function detectViolations(
  db: ReturnType<typeof createSupabaseServiceRole>,
  userId: string,
  sessionId: string,
  ip: string | null,
  country: string | null,
  playEventId: string,
) {
  const flags: Array<{
    flag_type: string;
    severity: string;
    details: object;
  }> = [];

  // 1. IP_DIVERSITY — too many different IPs in 2h (account sharing)
  if (ip) {
    const { data: recentPlays } = await db
      .from('play_events')
      .select('ip_address')
      .eq('user_id', userId)
      .gte('started_at', hoursAgo(2))
      .not('ip_address', 'is', null);

    const ips = [...new Set((recentPlays || []).map((p: any) => p.ip_address))];
    if (ips.length >= THRESHOLDS.IP_DIVERSITY_CRITICAL) {
      flags.push({
        flag_type: 'ip_diversity',
        severity: 'critical',
        details: { ips, count: ips.length, window_hours: 2, threshold: THRESHOLDS.IP_DIVERSITY_CRITICAL },
      });
    } else if (ips.length >= THRESHOLDS.IP_DIVERSITY_WARNING) {
      flags.push({
        flag_type: 'ip_diversity',
        severity: 'warning',
        details: { ips, count: ips.length, window_hours: 2, threshold: THRESHOLDS.IP_DIVERSITY_WARNING },
      });
    }
  }

  // 2. HIGH_FREQUENCY — same session replayed too many times
  const { count: sessionPlayCount } = await db
    .from('play_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .gte('started_at', daysAgo(7));

  if ((sessionPlayCount ?? 0) > THRESHOLDS.HIGH_FREQUENCY) {
    flags.push({
      flag_type: 'high_frequency',
      severity: 'warning',
      details: { session_id: sessionId, play_count: sessionPlayCount, window_days: 7 },
    });
  }

  // 3. CONCURRENT_COUNTRIES — this session active from 2+ countries in last 30 min
  if (country) {
    const { data: recentCountryPlays } = await db
      .from('play_events')
      .select('country_code')
      .eq('user_id', userId)
      .gte('started_at', minutesAgo(THRESHOLDS.CONCURRENT_WINDOW_MIN))
      .not('country_code', 'is', null);

    const countries = [...new Set((recentCountryPlays || []).map((p: any) => p.country_code))];
    if (countries.length >= 2) {
      flags.push({
        flag_type: 'concurrent_countries',
        severity: 'critical',
        details: { countries, window_minutes: THRESHOLDS.CONCURRENT_WINDOW_MIN, current_country: country },
      });
    }
  }

  // 4. MASS_PLAY — too many total plays today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayCount } = await db
    .from('play_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at', todayStart.toISOString());

  if ((todayCount ?? 0) >= THRESHOLDS.MASS_PLAY_DAY) {
    flags.push({
      flag_type: 'mass_play',
      severity: 'info',
      details: { play_count_today: todayCount, threshold: THRESHOLDS.MASS_PLAY_DAY },
    });
  }

  // Deduplicate: don't add flag if same type + user already has unresolved one from today
  for (const flag of flags) {
    const { data: existing } = await db
      .from('user_flags')
      .select('id')
      .eq('user_id', userId)
      .eq('flag_type', flag.flag_type)
      .eq('resolved', false)
      .gte('created_at', daysAgo(1))
      .maybeSingle();

    if (!existing) {
      await db.from('user_flags').insert({
        user_id: userId,
        flag_type: flag.flag_type,
        severity: flag.severity,
        details: { ...flag.details, trigger_event_id: playEventId },
        auto_detected: true,
      });
    }
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const sessionId = body.sessionId ?? body.recordingId;
  const { action, sessionType = 'vod', deviceId, eventId, durationSeconds } = body;

  if (!sessionId) return NextResponse.json({ error: 'sessionId or recordingId required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  // ── STOP: update existing event ──────────────────────────────────────────
  if (action === 'stop' && eventId) {
    await db
      .from('play_events')
      .update({ ended_at: new Date().toISOString(), play_duration_seconds: durationSeconds ?? null })
      .eq('id', eventId)
      .eq('user_id', user.id);
    return NextResponse.json({ ok: true });
  }

  // ── START: create new event + run violation detection ────────────────────
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const country = request.headers.get('x-vercel-ip-country') || null;
  const userAgent = request.headers.get('user-agent') || null;

  const { data: event, error } = await db
    .from('play_events')
    .insert({
      user_id: user.id,
      session_id: sessionId,
      session_type: sessionType,
      device_id: deviceId || null,
      ip_address: ip,
      country_code: country,
      user_agent: userAgent,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[play-event] insert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Run violation detection asynchronously (don't block the play response)
  detectViolations(db, user.id, sessionId, ip, country, event.id).catch((err) =>
    console.error('[play-event] violation detection error:', err)
  );

  return NextResponse.json({ eventId: event.id });
}
