// ============================================================================
// GET /api/admin/insights/[bookingId]
//
// Returns the raw transcript + metadata for a single booking's session
// insights, for use by the admin transcript accordion in
// /pl/konto/admin/nagrania-klientow.
//
// Authorization: canViewClientRecordings allowlist (admin + Natalia only).
// Other staff (Agata, Justyna, Przemek) are deliberately excluded — RODO
// data minimization. The same allowlist gates the panel page itself.
//
// Audit: every successful response is logged via auditInsightsAccess() with
// action='viewed_transcript'. Failed authorizations and 404s are NOT logged
// (we don't want to create an audit row for unauthorized probes — that
// would be useless noise and would let attackers grow our audit table).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canViewClientRecordings } from '@/lib/roles';
import { auditInsightsAccessFromRequest } from '@/lib/audit/insights-audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  if (!bookingId || typeof bookingId !== 'string') {
    return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
  }

  // ── Auth: admin + Natalia allowlist ─────────────────────────────────────
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !canViewClientRecordings(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Fetch insights row ──────────────────────────────────────────────────
  const db = createSupabaseServiceRole();
  const { data: insights, error } = await db
    .from('session_client_insights')
    .select(
      'booking_id, live_session_id, transcript, journey_summary, summary, status, analyzed_at, analysis_model',
    )
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (error) {
    console.error('[insights API] fetch error:', error.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!insights) {
    return NextResponse.json({ error: 'No insights for this booking' }, { status: 404 });
  }

  if (insights.status !== 'ready') {
    return NextResponse.json(
      { error: `Insights not ready (status: ${insights.status})`, status: insights.status },
      { status: 409 },
    );
  }

  // ── Audit: log the read AFTER successful auth + data fetch ──────────────
  // Best-effort — auditInsightsAccessFromRequest never throws.
  await auditInsightsAccessFromRequest(
    request,
    { id: user.id, email: user.email ?? null },
    bookingId,
    'viewed_transcript',
    {
      live_session_id: insights.live_session_id,
      segment_count: Array.isArray(insights.transcript) ? insights.transcript.length : 0,
    },
  );

  return NextResponse.json({
    bookingId: insights.booking_id,
    liveSessionId: insights.live_session_id,
    transcript: insights.transcript ?? [],
    journeySummary: insights.journey_summary,
    summary: insights.summary,
    analyzedAt: insights.analyzed_at,
    analysisModel: insights.analysis_model,
  });
}
