// Compute organizational (D2) and relational (D3) scores from DB data.
// D1 (merytoryczny) is set manually by admin (future: Claude transcript analysis).

import { SupabaseClient } from '@supabase/supabase-js';

export interface ComputedProfile {
  userId: string;
  d2: number;  // Organizacyjny 0–10
  d3: number;  // Relacyjny 0–10
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsAsModerator: number;
  totalSpeakingSeconds: number;
  avgSpeakingSeconds: number;
  uniqueGroupmates: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// D2: Organizacyjny — measures discipline and balance of participation
//   - attendance_rate (40%): sessions_completed / sessions_total
//   - duration_balance (30%): how close avg speaking time is to ideal (90s)
//   - regularity (30%): punish very high or very low speaking → prefer moderate, consistent speakers
function computeD2(p: ComputedProfile): number {
  if (p.sessionsTotal === 0) return 5.0;

  const attendance = p.sessionsCompleted / p.sessionsTotal;  // 0–1

  // Duration balance: ideal ≈ 90s per turn.  >180s = dominant, <20s = passive
  const avg       = p.avgSpeakingSeconds;
  const durationOk = avg >= 20 && avg <= 300
    ? 1 - Math.abs(avg - 90) / 210  // peaks at 90s
    : avg > 0 ? 0.2 : 0.0;

  // Regularity: punish those who spoke a LOT or almost nothing total
  const totalMinutes = p.totalSpeakingSeconds / 60;
  const expectedMinsPerSession = 1.5; // ~90s per session
  const expectedTotal = p.sessionsTotal * expectedMinsPerSession;
  const regularity = expectedTotal > 0
    ? clamp(1 - Math.abs(totalMinutes - expectedTotal) / (expectedTotal + 1), 0, 1)
    : 0.5;

  const raw = 0.40 * attendance + 0.30 * durationOk + 0.30 * regularity;
  return clamp(raw * 10, 0, 10);
}

// D3: Relacyjny — measures interpersonal engagement
//   - moderator_rate (40%): how often they stepped up as moderator
//   - diversity (35%): unique groupmates / (sessions * avg_group_size)
//   - consistency (25%): appeared in multiple sessions (not a one-time visitor)
function computeD3(p: ComputedProfile): number {
  if (p.sessionsTotal === 0) return 5.0;

  const moderatorRate = clamp(p.sessionsAsModerator / p.sessionsTotal, 0, 1);

  // Diversity: met at least 4 unique people per session is excellent
  const expectedUnique = p.sessionsTotal * 4;
  const diversity      = clamp(p.uniqueGroupmates / (expectedUnique + 1), 0, 1);

  // Consistency: being present in 3+ sessions shows relational commitment
  const consistency = clamp(p.sessionsTotal / 5, 0, 1);  // saturates at 5 sessions

  const raw = 0.40 * moderatorRate + 0.35 * diversity + 0.25 * consistency;
  return clamp(raw * 10, 0, 10);
}

// Recompute all profiles from htg_speaking_events + htg_meeting_participants
// Returns the number of profiles upserted.
export async function recomputeAllProfiles(db: SupabaseClient): Promise<number> {
  // 1. Get all participants with their session info
  const { data: participations } = await db
    .from('htg_meeting_participants')
    .select(`
      user_id, display_name, email, is_moderator, status, joined_at, left_at,
      htg_meeting_sessions!inner ( id, ended_at, started_at )
    `);

  if (!participations || participations.length === 0) return 0;

  // 2. Get all speaking events
  const { data: speakingEvents } = await db
    .from('htg_speaking_events')
    .select('user_id, session_id, started_offset_seconds, ended_offset_seconds');

  // 3. Build per-user stats
  const stats = new Map<string, {
    userId: string;
    displayName: string;
    email: string;
    sessionsTotal: number;
    sessionsCompleted: number;
    sessionsAsModerator: number;
    totalSpeakingSeconds: number;
    speakingTurns: number[];
    sessionmates: Set<string>;
    sessionIds: Set<string>;
  }>();

  for (const p of participations as any[]) {
    const uid = p.user_id;
    if (!stats.has(uid)) {
      stats.set(uid, {
        userId: uid,
        displayName: p.display_name ?? '',
        email: p.email ?? '',
        sessionsTotal: 0,
        sessionsCompleted: 0,
        sessionsAsModerator: 0,
        totalSpeakingSeconds: 0,
        speakingTurns: [],
        sessionmates: new Set(),
        sessionIds: new Set(),
      });
    }

    const s = stats.get(uid)!;
    s.sessionsTotal++;
    if (p.is_moderator) s.sessionsAsModerator++;
    if (p.status === 'left' || p.htg_meeting_sessions?.ended_at) s.sessionsCompleted++;
    s.sessionIds.add(p.htg_meeting_sessions?.id);
  }

  // Sessionmates — who else was in each session
  const sessionParticipants = new Map<string, string[]>();
  for (const p of participations as any[]) {
    const sid = p.htg_meeting_sessions?.id;
    if (!sid) continue;
    if (!sessionParticipants.has(sid)) sessionParticipants.set(sid, []);
    sessionParticipants.get(sid)!.push(p.user_id);
  }
  for (const [sid, uids] of sessionParticipants) {
    for (const uid of uids) {
      const s = stats.get(uid);
      if (!s) continue;
      for (const other of uids) {
        if (other !== uid) s.sessionmates.add(other);
      }
    }
  }

  // Speaking stats
  for (const ev of (speakingEvents ?? []) as any[]) {
    const s = stats.get(ev.user_id);
    if (!s) continue;
    const dur = Math.max(0, ev.ended_offset_seconds - ev.started_offset_seconds);
    s.totalSpeakingSeconds += dur;
    s.speakingTurns.push(dur);
  }

  // 4. Compute profiles and upsert
  const profiles = [];
  for (const [uid, s] of stats) {
    const avgSpeak = s.speakingTurns.length > 0
      ? s.totalSpeakingSeconds / s.speakingTurns.length
      : 0;

    const p: ComputedProfile = {
      userId: uid,
      d2: 0, d3: 0,
      sessionsTotal: s.sessionsTotal,
      sessionsCompleted: s.sessionsCompleted,
      sessionsAsModerator: s.sessionsAsModerator,
      totalSpeakingSeconds: s.totalSpeakingSeconds,
      avgSpeakingSeconds: avgSpeak,
      uniqueGroupmates: s.sessionmates.size,
    };
    p.d2 = computeD2(p);
    p.d3 = computeD3(p);

    profiles.push({
      user_id: uid,
      display_name: s.displayName,
      email: s.email,
      score_organizacyjny: p.d2,
      score_relacyjny: p.d3,
      sessions_total: p.sessionsTotal,
      sessions_completed: p.sessionsCompleted,
      sessions_as_moderator: p.sessionsAsModerator,
      total_speaking_seconds: p.totalSpeakingSeconds,
      avg_speaking_seconds: p.avgSpeakingSeconds,
      unique_groupmates: p.uniqueGroupmates,
      last_computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const { error } = await db
    .from('htg_participant_profiles')
    .upsert(profiles, { onConflict: 'user_id' });

  if (error) throw error;
  return profiles.length;
}
