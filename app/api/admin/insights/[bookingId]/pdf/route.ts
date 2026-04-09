// ============================================================================
// GET /api/admin/insights/[bookingId]/pdf
//
// Returns a printable PDF of the raw transcript for one booking. The PDF is
// generated server-side via pdfkit and streamed back as application/pdf.
// Used by the "Pobierz PDF" button in the admin transcript accordion.
//
// Authorization: canViewClientRecordings allowlist (admin + Natalia).
// Same restriction as the JSON endpoint and the panel page itself.
//
// Audit: every successful PDF download is logged with action='downloaded_pdf'.
// The audit details capture the segment count and the resolved client name
// for context in art. 15 responses ("when did admin X download Anna's
// transcript?").
//
// Runtime: pdfkit needs Node.js APIs (Buffer, streams). We mark this route
// `export const runtime = 'nodejs'` explicitly even though that's the
// Next.js App Router default — defensive against future config changes.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canViewClientRecordings } from '@/lib/roles';
import { auditInsightsAccessFromRequest } from '@/lib/audit/insights-audit';
import { generateTranscriptPdf, type TranscriptSegment } from '@/lib/admin/transcript-pdf';

export const runtime = 'nodejs';
// PDF generation can take a few seconds for very long sessions.
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  if (!bookingId || typeof bookingId !== 'string') {
    return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !canViewClientRecordings(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Fetch insights + booking metadata for the PDF header ────────────────
  const db = createSupabaseServiceRole();
  const { data: insights, error: insErr } = await db
    .from('session_client_insights')
    .select('booking_id, live_session_id, transcript, status')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (insErr) {
    console.error('[insights PDF] fetch error:', insErr.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  if (!insights) {
    return NextResponse.json({ error: 'No insights for this booking' }, { status: 404 });
  }
  if (insights.status !== 'ready') {
    return NextResponse.json(
      { error: `Insights not ready (status: ${insights.status})` },
      { status: 409 },
    );
  }

  // Resolve session date and client name from bookings + profiles for the
  // PDF header. These are best-effort — the PDF still renders if missing.
  const { data: booking } = await db
    .from('bookings')
    .select('user_id, session_at')
    .eq('id', bookingId)
    .maybeSingle();

  let clientName: string | null = null;
  if (booking?.user_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('display_name, email')
      .eq('id', booking.user_id)
      .maybeSingle();
    clientName = profile?.display_name ?? profile?.email ?? null;
  }

  const sessionDate = booking?.session_at
    ? new Date(booking.session_at as string).toLocaleDateString('pl-PL')
    : null;

  // ── Generate the PDF ─────────────────────────────────────────────────────
  const segments = (insights.transcript ?? []) as TranscriptSegment[];
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateTranscriptPdf(segments, {
      bookingId,
      sessionDate,
      clientName,
      generatedAt: new Date(),
      generatedByEmail: user.email ?? null,
    });
  } catch (e) {
    console.error('[insights PDF] generation error:', (e as Error).message);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }

  // ── Audit: log the download ──────────────────────────────────────────────
  await auditInsightsAccessFromRequest(
    request,
    { id: user.id, email: user.email ?? null },
    bookingId,
    'downloaded_pdf',
    {
      live_session_id: insights.live_session_id,
      segment_count: segments.length,
      client_name: clientName,
      pdf_bytes: pdfBuffer.byteLength,
    },
  );

  // ── Stream the PDF ───────────────────────────────────────────────────────
  // Filename uses the session date if available, falling back to booking id.
  const safeName = (clientName ?? bookingId)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const filename = `transkrypcja-${safeName}-${sessionDate ?? bookingId}.pdf`;

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.byteLength.toString(),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
