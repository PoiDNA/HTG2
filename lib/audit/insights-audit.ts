// ============================================================================
// Insights audit helper
//
// Logs every staff access to session_client_insights data (transcripts +
// AI-extracted client journey insights). RODO art. 9 sensitive data — every
// read by staff must be loggable so we can answer art. 15 ("kto i kiedy widział
// moje dane") within the legal deadline.
//
// Pattern: thin wrapper around an INSERT into session_client_insights_audit.
// Designed to be best-effort — errors are logged to console but never thrown,
// so a failure to audit does NOT block the user-facing response. Audit gaps
// are detectable post-hoc by comparing against application logs.
//
// Used from server-side admin routes only (admin transcript viewer, PDF export
// endpoint, agent API stub when implemented). Never call from client code.
// ============================================================================

import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * Allowed action codes — must match the CHECK constraint in migration 054.
 *
 * - viewed_list: admin opened the recordings/insights list page (booking_id
 *   should be the nil sentinel '00000000-0000-0000-0000-000000000000')
 * - viewed_transcript: admin expanded the transcript accordion for one row
 * - viewed_insights: admin viewed the extracted insights (problems, emotions,
 *   life_events, goals, breakthroughs, journey_summary) for one row
 * - downloaded_pdf: admin downloaded a transcript PDF for one row
 */
export type InsightsAuditAction =
  | 'viewed_list'
  | 'viewed_transcript'
  | 'viewed_insights'
  | 'downloaded_pdf';

/**
 * Sentinel UUID used when an action does not apply to a specific booking
 * (e.g. opening the listing page). Matches the pattern from
 * client_recording_audit (migration 050).
 */
export const NIL_BOOKING_ID = '00000000-0000-0000-0000-000000000000';

export interface AuditInsightsAccessParams {
  bookingId: string;
  actorId: string | null;
  actorEmail: string | null;
  action: InsightsAuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Insert an audit row for staff access to session_client_insights data.
 *
 * Best-effort: never throws. If the insert fails for any reason (e.g.
 * Supabase outage, schema drift), the error is logged to console.error and
 * the function returns false. Callers should NOT block their response on
 * the audit succeeding.
 *
 * @returns true if the audit row was inserted, false on failure.
 */
export async function auditInsightsAccess(
  params: AuditInsightsAccessParams,
): Promise<boolean> {
  const {
    bookingId,
    actorId,
    actorEmail,
    action,
    details = {},
    ipAddress = null,
    userAgent = null,
  } = params;

  try {
    const db = createSupabaseServiceRole();
    const { error } = await db.from('session_client_insights_audit').insert({
      booking_id: bookingId,
      actor_id: actorId,
      actor_email: actorEmail,
      action,
      details,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    if (error) {
      console.error('[insights-audit] insert failed:', error.message, {
        action,
        bookingId,
        actorId,
      });
      return false;
    }
    return true;
  } catch (e) {
    console.error('[insights-audit] unexpected error:', (e as Error).message, {
      action,
      bookingId,
    });
    return false;
  }
}

/**
 * Convenience wrapper for the most common case: audit a single read action
 * triggered by an HTTP request, extracting IP and user-agent from headers.
 *
 * @param request   The incoming Next.js request (for headers extraction).
 * @param actor     { id, email } of the authenticated staff user.
 * @param bookingId The booking whose insights are being accessed (or
 *                  NIL_BOOKING_ID for list views).
 * @param action    What the staff user is doing.
 * @param details   Action-specific context (e.g. { recording_id: '...' }).
 */
export async function auditInsightsAccessFromRequest(
  request: Request,
  actor: { id: string; email: string | null },
  bookingId: string,
  action: InsightsAuditAction,
  details: Record<string, unknown> = {},
): Promise<boolean> {
  const ipAddress =
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    null;
  const userAgent = request.headers.get('user-agent') ?? null;

  return auditInsightsAccess({
    bookingId,
    actorId: actor.id,
    actorEmail: actor.email,
    action,
    details,
    ipAddress,
    userAgent,
  });
}
