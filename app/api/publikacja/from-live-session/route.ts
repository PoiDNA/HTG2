import { NextRequest, NextResponse } from 'next/server';
import { requirePublication } from '@/lib/publication/auth';

export async function POST(request: NextRequest) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const { supabase } = auth;

  const body = await request.json();
  const { liveSessionId, title, monthlySetId } = body;

  if (!liveSessionId) {
    return NextResponse.json({ error: 'liveSessionId is required' }, { status: 400 });
  }

  // Fetch live session
  const { data: liveSession, error: sessionError } = await supabase
    .from('live_sessions')
    .select('id, room_name, recording_sesja_tracks, recording_sesja_url, egress_sesja_tracks_ids, created_at')
    .eq('id', liveSessionId)
    .single();

  if (sessionError || !liveSession) {
    return NextResponse.json({ error: 'Live session not found' }, { status: 404 });
  }

  // Check if publication already exists for this live session
  const { data: existing } = await supabase
    .from('session_publications')
    .select('id')
    .eq('live_session_id', liveSessionId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'Publikacja już istnieje dla tej sesji', publicationId: existing.id },
      { status: 409 }
    );
  }

  // Convert recording_sesja_tracks {participantId: url} → [{name, url}]
  const recordingTracks = (liveSession.recording_sesja_tracks as Record<string, string>) || {};
  const participantIds = Object.keys(recordingTracks);

  // Try to map participant IDs to human names — two safe typed queries in parallel
  // (avoids building .or() strings that could break on commas/parens in IDs)
  const [staffByIdResult, staffByEmailResult, profilesResult] = await Promise.all([
    participantIds.length > 0
      ? supabase.from('staff_members').select('id, name, email').in('id', participantIds)
      : Promise.resolve({ data: [] }),
    participantIds.length > 0
      ? supabase.from('staff_members').select('id, name, email').in('email', participantIds)
      : Promise.resolve({ data: [] }),
    participantIds.length > 0
      ? supabase.from('profiles').select('id, email, display_name').in('id', participantIds)
      : Promise.resolve({ data: [] }),
  ]);

  const staffMembers = [
    ...(staffByIdResult.data || []),
    ...(staffByEmailResult.data || []),
  ];
  const profiles = profilesResult.data;

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const staffById = new Map((staffMembers || []).map((s: any) => [s.id, s.name as string]));
  const staffByEmail = new Map((staffMembers || []).map((s: any) => [s.email, s.name as string]));

  const sourceTracks = Object.entries(recordingTracks).map(([participantId, url]) => {
    const profile = profileMap.get(participantId) as any;
    const name =
      staffById.get(participantId) ||
      (profile?.email ? staffByEmail.get(profile.email) : undefined) ||
      profile?.display_name ||
      profile?.email ||
      participantId.slice(0, 12);
    return { name, url };
  });

  // Auto-generate title if not provided
  const sessionDate = new Date(liveSession.created_at).toLocaleDateString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const autoTitle = title || `Sesja ${sessionDate}${liveSession.room_name ? ` — ${liveSession.room_name}` : ''}`;

  const { data: publication, error: pubError } = await supabase
    .from('session_publications')
    .insert({
      title: autoTitle,
      live_session_id: liveSessionId,
      status: 'raw',
      source_tracks: sourceTracks,
      source_composite_url: liveSession.recording_sesja_url || null,
      monthly_set_id: monthlySetId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (pubError) {
    return NextResponse.json({ error: pubError.message }, { status: 500 });
  }

  return NextResponse.json({ publication });
}
