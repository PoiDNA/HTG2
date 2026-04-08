// Orchestrator: download → transcribe → identify → merge → analyze → return.

import type { createSupabaseServiceRole } from '@/lib/supabase/service';
import type { Phase, SpeakerSegment, ClientInsights } from './types';
import { ANALYSIS_MODEL, ANALYSIS_PROMPT_VERSION, TRANSCRIPT_MODEL } from './types';
import { AnalysisError } from './errors';
import { downloadFromR2 } from './r2-download';
import { transcribeAudio, type TranscriptionResult } from './transcribe-audio';
import { identifySpeakers } from './identify-speakers';
import { mergePhaseToSegments } from './merge-transcripts';
import { analyzeSessionJourney } from './analyze';
import { createLimiter } from './concurrency';

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRole>;

export interface AnalysisRunResult {
  transcript: SpeakerSegment[];
  insights: ClientInsights;
  metadata: {
    transcriptModel: string;
    analysisModel: string;
    promptVersion: string;
    trackCount: number;
    durationMs: number;
  };
}

export async function runClientAnalysis(
  db: SupabaseServiceClient,
  liveSessionId: string,
): Promise<AnalysisRunResult> {
  const startedAt = Date.now();
  const limiter = createLimiter(3); // max 3 concurrent Whisper calls

  // 1. Load all completed track egresses for this session
  const { data: tracks, error: tracksErr } = await db
    .from('analytics_track_egresses')
    .select('phase, participant_identity, file_url')
    .eq('live_session_id', liveSessionId)
    .not('file_url', 'is', null);

  if (tracksErr) {
    throw new AnalysisError('unknown', `track query failed: ${tracksErr.message}`);
  }
  if (!tracks || tracks.length === 0) {
    throw new AnalysisError('no_client_tracks', 'no completed analytics tracks');
  }

  // 2. Identify speakers (role map)
  let roleMap;
  try {
    roleMap = await identifySpeakers(db, liveSessionId);
  } catch (e) {
    if (e instanceof AnalysisError) throw e;
    throw new AnalysisError('identify_speakers_failed', (e as Error)?.message);
  }

  // 3. Group tracks by phase
  const byPhase: Record<Phase, Array<{ identity: string; fileUrl: string }>> = {
    wstep: [],
    sesja: [],
    podsumowanie: [],
  };
  for (const t of tracks) {
    const phase = t.phase as Phase;
    if (phase in byPhase && t.file_url && t.participant_identity) {
      byPhase[phase].push({ identity: t.participant_identity, fileUrl: t.file_url });
    }
  }

  // 4. For each phase, download + transcribe in parallel (limited)
  const phaseSegments: Record<Phase, SpeakerSegment[]> = {
    wstep: [],
    sesja: [],
    podsumowanie: [],
  };

  for (const phase of ['wstep', 'sesja', 'podsumowanie'] as Phase[]) {
    const phaseTracks = byPhase[phase];
    if (phaseTracks.length === 0) continue;

    const results = await Promise.all(
      phaseTracks.map((track) =>
        limiter<TranscriptionResult>(async () => {
          const buffer = await downloadFromR2(track.fileUrl);
          return transcribeAudio(buffer, track.identity, track.fileUrl);
        }),
      ),
    );

    phaseSegments[phase] = mergePhaseToSegments(phase, results, roleMap);
  }

  // 5. Concatenate chronologically per phase (timestamps reset per phase)
  const allSegments: SpeakerSegment[] = [
    ...phaseSegments.wstep,
    ...phaseSegments.sesja,
    ...phaseSegments.podsumowanie,
  ];

  // 6. Sanity check — must have at least one client segment
  if (!allSegments.some((s) => s.speaker === 'client')) {
    throw new AnalysisError('no_client_tracks', 'no segments from speaker=client');
  }

  // 7. Analyze via Claude
  const insights = await analyzeSessionJourney(allSegments);

  return {
    transcript: allSegments,
    insights,
    metadata: {
      transcriptModel: TRANSCRIPT_MODEL,
      analysisModel: ANALYSIS_MODEL,
      promptVersion: ANALYSIS_PROMPT_VERSION,
      trackCount: tracks.length,
      durationMs: Date.now() - startedAt,
    },
  };
}
