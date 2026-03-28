import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';

function daysAgo(d: number) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: NextRequest) {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || (!isAdminEmail(user.email ?? '') && !isStaffEmail(user.email ?? ''))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'summary'; // summary | vod_list | retention | recordings_list
  const sessionId = searchParams.get('sessionId');

  // ── RETENTION GRAPH ───────────────────────────────────────────────────────
  if (type === 'retention' && sessionId) {
    const { data: positions } = await db
      .from('playback_positions')
      .select('play_event_id, position_seconds, total_duration_seconds')
      .eq('session_id', sessionId)
      .order('position_seconds', { ascending: true });

    if (!positions || positions.length === 0) {
      return NextResponse.json({ buckets: [], totalViewers: 0 });
    }

    // Find total duration (use max reported duration, fallback to max position)
    const maxDuration = Math.max(
      ...positions.map(p => p.total_duration_seconds ?? p.position_seconds),
      60
    );

    // Unique play_event_ids = total viewer sessions
    const allEventIds = new Set(positions.map(p => p.play_event_id).filter(Boolean));
    const totalViewers = allEventIds.size;

    // Build 30-second buckets
    const BUCKET_SIZE = 30;
    const numBuckets = Math.ceil(maxDuration / BUCKET_SIZE);
    const buckets: { position: number; count: number; pct: number }[] = [];

    for (let i = 0; i < numBuckets; i++) {
      const bucketStart = i * BUCKET_SIZE;
      const bucketEnd = (i + 1) * BUCKET_SIZE;

      // Unique event IDs that had a position within this bucket
      const viewersInBucket = new Set(
        positions
          .filter(p => p.position_seconds >= bucketStart && p.position_seconds < bucketEnd)
          .map(p => p.play_event_id)
          .filter(Boolean)
      ).size;

      buckets.push({
        position: bucketStart,
        count: viewersInBucket,
        pct: totalViewers > 0 ? Math.round((viewersInBucket / totalViewers) * 100) : 0,
      });
    }

    return NextResponse.json({ buckets, totalViewers, totalDuration: maxDuration });
  }

  // ── SUMMARY CARDS ─────────────────────────────────────────────────────────
  if (type === 'summary') {
    const since30d = daysAgo(30);
    const since7d  = daysAgo(7);

    const [vod30, vod7, rpe30, rpe7] = await Promise.all([
      db.from('play_events').select('id, user_id, play_duration_seconds', { count: 'exact' })
        .gte('started_at', since30d).not('ended_at', 'is', null),
      db.from('play_events').select('id', { count: 'exact' })
        .gte('started_at', since7d),
      db.from('recording_play_events').select('id, user_id, play_duration_seconds', { count: 'exact' })
        .gte('started_at', since30d),
      db.from('recording_play_events').select('id', { count: 'exact' })
        .gte('started_at', since7d),
    ]);

    const vodRows = vod30.data ?? [];
    const rpeRows = rpe30.data ?? [];

    const uniqueVodUsers = new Set(vodRows.map((r: any) => r.user_id)).size;
    const uniqueRpeUsers = new Set(rpeRows.map((r: any) => r.user_id)).size;

    const totalVodSeconds = vodRows.reduce((acc: number, r: any) => acc + (r.play_duration_seconds ?? 0), 0);
    const totalRpeSeconds = rpeRows.reduce((acc: number, r: any) => acc + (r.play_duration_seconds ?? 0), 0);

    return NextResponse.json({
      vod: {
        plays30d: vod30.count ?? 0,
        plays7d: vod7.count ?? 0,
        uniqueUsers30d: uniqueVodUsers,
        totalHours30d: Math.round(totalVodSeconds / 3600 * 10) / 10,
      },
      recordings: {
        plays30d: rpe30.count ?? 0,
        plays7d: rpe7.count ?? 0,
        uniqueUsers30d: uniqueRpeUsers,
        totalHours30d: Math.round(totalRpeSeconds / 3600 * 10) / 10,
      },
    });
  }

  // ── VOD SESSION LIST ──────────────────────────────────────────────────────
  if (type === 'vod_list') {
    const since30d = daysAgo(30);
    const { data: events } = await db
      .from('play_events')
      .select('session_id, user_id, play_duration_seconds, started_at')
      .gte('started_at', since30d)
      .order('started_at', { ascending: false });

    if (!events) return NextResponse.json({ sessions: [] });

    // Aggregate by session_id
    const map = new Map<string, { plays: number; uniqueUsers: Set<string>; totalSeconds: number }>();
    for (const e of events as any[]) {
      if (!map.has(e.session_id)) {
        map.set(e.session_id, { plays: 0, uniqueUsers: new Set(), totalSeconds: 0 });
      }
      const entry = map.get(e.session_id)!;
      entry.plays++;
      entry.uniqueUsers.add(e.user_id);
      entry.totalSeconds += e.play_duration_seconds ?? 0;
    }

    // Fetch session names
    const sessionIds = [...map.keys()];
    const { data: templates } = await db
      .from('session_templates')
      .select('id, title')
      .in('id', sessionIds);

    const templateMap = new Map((templates ?? []).map((t: any) => [t.id, t.title]));

    const sessions = [...map.entries()].map(([id, stats]) => ({
      sessionId: id,
      title: templateMap.get(id) || `Sesja ${id.slice(0, 8)}`,
      plays: stats.plays,
      uniqueUsers: stats.uniqueUsers.size,
      avgMinutes: stats.plays > 0 ? Math.round(stats.totalSeconds / stats.plays / 60 * 10) / 10 : 0,
    })).sort((a, b) => b.plays - a.plays);

    return NextResponse.json({ sessions });
  }

  // ── RECORDINGS LIST ────────────────────────────────────────────────────────
  if (type === 'recordings_list') {
    const since30d = daysAgo(30);
    const { data: events } = await db
      .from('recording_play_events')
      .select('recording_id, user_id, play_duration_seconds, started_at')
      .gte('started_at', since30d)
      .not('recording_id', 'is', null);

    if (!events) return NextResponse.json({ recordings: [] });

    const map = new Map<string, { plays: number; uniqueUsers: Set<string>; totalSeconds: number }>();
    for (const e of events as any[]) {
      if (!map.has(e.recording_id)) {
        map.set(e.recording_id, { plays: 0, uniqueUsers: new Set(), totalSeconds: 0 });
      }
      const entry = map.get(e.recording_id)!;
      entry.plays++;
      entry.uniqueUsers.add(e.user_id);
      entry.totalSeconds += e.play_duration_seconds ?? 0;
    }

    const recIds = [...map.keys()];
    const { data: recs } = await db
      .from('client_recordings')
      .select('id, type, format, created_at, duration_seconds')
      .in('id', recIds);

    const recMap = new Map((recs ?? []).map((r: any) => [r.id, r]));

    const recordings = [...map.entries()].map(([id, stats]) => {
      const rec = recMap.get(id);
      return {
        recordingId: id,
        type: rec?.type ?? '?',
        format: rec?.format ?? '?',
        createdAt: rec?.created_at,
        durationSeconds: rec?.duration_seconds,
        plays: stats.plays,
        uniqueUsers: stats.uniqueUsers.size,
        avgSeconds: stats.plays > 0 ? Math.round(stats.totalSeconds / stats.plays) : 0,
      };
    }).sort((a, b) => b.plays - a.plays);

    return NextResponse.json({ recordings });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}
