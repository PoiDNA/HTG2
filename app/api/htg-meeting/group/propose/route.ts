import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { computeGroups } from '@/lib/meetings/grouping';

// POST /api/htg-meeting/group/propose
// Body: { userIds: string[], groupSizeMin?: number, groupSizeMax?: number, meetingId?: string }
// Returns: GroupingResult (no DB write — just the proposal)
export async function POST(req: NextRequest) {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin       = isAdminEmail(user.email ?? '');
  const isPractitioner = staffMember?.role === 'practitioner';
  if (!isAdmin && !isPractitioner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const {
    userIds = [],
    groupSizeMin = 4,
    groupSizeMax = 6,
  }: {
    userIds: string[];
    groupSizeMin?: number;
    groupSizeMax?: number;
  } = body;

  if (!userIds.length) {
    return NextResponse.json({ error: 'Brak uczestników' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Fetch profiles for selected users
  const { data: profiles, error } = await db
    .from('htg_participant_profiles')
    .select('*')
    .in('user_id', userIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch past groupmate data for each user
  // For each user, get all userIds they've been in a session with
  const { data: pastParticipations } = await db
    .from('htg_meeting_participants')
    .select('user_id, session_id')
    .in('user_id', userIds);

  const sessionIds = [...new Set((pastParticipations ?? []).map((p: any) => p.session_id))];

  const { data: allSessionParts } = sessionIds.length > 0
    ? await db
        .from('htg_meeting_participants')
        .select('user_id, session_id')
        .in('session_id', sessionIds)
    : { data: [] };

  // Build pastGroupmates map: userId → string[]
  const pastGroupmates = new Map<string, string[]>();
  for (const uid of userIds) {
    const mySessions = (pastParticipations ?? [])
      .filter((p: any) => p.user_id === uid)
      .map((p: any) => p.session_id);

    const mates = (allSessionParts ?? [])
      .filter((p: any) => mySessions.includes(p.session_id) && p.user_id !== uid)
      .map((p: any) => p.user_id as string);

    pastGroupmates.set(uid, [...new Set(mates)]);
  }

  // Build input for grouping algorithm
  // Users selected but without a profile get default scores
  const userScores = userIds.map(uid => {
    const p = (profiles ?? []).find((pr: any) => pr.user_id === uid);
    return {
      userId: uid,
      displayName: p?.display_name ?? `Uczestnik (${uid.slice(0, 6)})`,
      email: p?.email,
      d1: p?.score_merytoryczny ?? 5.0,
      d2: p?.score_organizacyjny ?? 5.0,
      d3: p?.score_relacyjny ?? 5.0,
      pastGroupmates: pastGroupmates.get(uid) ?? [],
    };
  });

  try {
    const result = computeGroups(userScores, { groupSizeMin, groupSizeMax });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
