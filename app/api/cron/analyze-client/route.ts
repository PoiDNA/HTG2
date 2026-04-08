// ============================================================
// Client Journey Analytics — cron worker
//
// Runs every 5 minutes. For each eligible session (ended + at least one
// completed analytics track + not yet analyzed / failed with retry / stale),
// runs the full pipeline: download → transcribe → merge → analyze → persist.
//
// Gate: CLIENT_ANALYTICS_ENABLED=true (off by default until PRE-1, PRE-2, PRE-3
// are resolved).
//
// Auth: fail-closed — missing CRON_SECRET returns 500, wrong header returns 401.
// No development-mode bypass (sensitive data under art. 9 RODO).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { runClientAnalysis } from '@/lib/client-analysis/run';
import { AnalysisError, type AnalysisErrorCode } from '@/lib/client-analysis/errors';

export const maxDuration = 800;

export async function GET(request: NextRequest) {
  // Feature flag — centralized kill switch
  if (process.env.CLIENT_ANALYTICS_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: 'analytics_disabled' });
  }

  // Fail-closed auth — no dev bypass
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServiceRole();

  // 1. Find next candidate session (via DB helper RPC with grace period)
  const { data: candidateRows, error: candidateErr } = await db.rpc('find_next_analytics_candidate');
  if (candidateErr) {
    console.error('[client-analysis] find_next error:', candidateErr.message);
    return NextResponse.json({ ok: false, error: 'find_next_failed' }, { status: 500 });
  }

  const candidate = Array.isArray(candidateRows) ? candidateRows[0] : null;
  if (!candidate) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const sessionId = candidate.id as string;
  const bookingId = candidate.booking_id as string;

  // 2. Atomic claim — INSERT fresh or UPDATE failed/stale. JS never increments retry_count.
  const { data: claimRows, error: claimErr } = await db.rpc('claim_analytics_session', {
    p_live_session_id: sessionId,
    p_booking_id: bookingId,
  });
  if (claimErr) {
    console.error('[client-analysis] claim error:', claimErr.message);
    return NextResponse.json({ ok: false, error: 'claim_failed' }, { status: 500 });
  }
  const claimed = Array.isArray(claimRows) ? claimRows[0] : null;
  if (!claimed) {
    // Another worker already claimed this session, or it's not eligible for retry
    return NextResponse.json({ ok: true, processed: 0, reason: 'not_claimed' });
  }

  const t0 = Date.now();
  console.log('[client-analysis] processing', { sessionId });

  try {
    const result = await runClientAnalysis(db, sessionId);

    // Derive client_user_ids from transcript (unique identities marked as 'client')
    const clientIds = Array.from(
      new Set(result.transcript.filter((s) => s.speaker === 'client').map((s) => s.identity)),
    );

    const { error: updateErr } = await db
      .from('session_client_insights')
      .update({
        client_user_ids: clientIds,
        transcript: result.transcript,
        problems: result.insights.problems,
        emotional_states: result.insights.emotional_states,
        life_events: result.insights.life_events,
        goals: result.insights.goals,
        breakthroughs: result.insights.breakthroughs,
        journey_summary: result.insights.journey_summary,
        summary: result.insights.summary,
        analysis_model: result.metadata.analysisModel,
        analysis_prompt_version: result.metadata.promptVersion,
        analyzed_at: new Date().toISOString(),
        status: 'ready',
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('live_session_id', sessionId);

    if (updateErr) {
      console.error('[client-analysis] final update error:', updateErr.message);
    }

    console.log('[client-analysis] done', {
      sessionId,
      durationMs: Date.now() - t0,
      trackCount: result.metadata.trackCount,
      segmentCount: result.transcript.length,
    });

    return NextResponse.json({ ok: true, sessionId, processed: 1 });
  } catch (e) {
    const code: AnalysisErrorCode = e instanceof AnalysisError ? e.code : 'unknown';
    console.error('[client-analysis] failed', { sessionId, code, durationMs: Date.now() - t0 });

    await db
      .from('session_client_insights')
      .update({
        status: 'failed',
        error: code, // enum code only — no PII, no raw model output
        updated_at: new Date().toISOString(),
      })
      .eq('live_session_id', sessionId);

    return NextResponse.json({ ok: false, sessionId, code }, { status: 500 });
  }
}
