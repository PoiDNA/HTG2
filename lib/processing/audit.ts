/**
 * Processing export audit logger.
 *
 * Zapisuje wpisy do processing_export_audit (mig 067) dla każdego
 * wywołania endpointa processing service. Używane WYŁĄCZNIE do raportów
 * DPO — NIE jest źródłem autoryzacji (to processing_export_subjects).
 *
 * Patrz: docs/processing-service-plan.md §20.5, mig 067
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ProcessingAuditType =
  | 'export_single'
  | 'export_batch'
  | 'fingerprint_check'
  | 'write_back_advisory'
  | 'reserve_version'
  | 'job_create'
  | 'job_start'
  | 'job_status'
  | 'purge_send';

export interface ProcessingAuditEntry {
  type: ProcessingAuditType;
  processing_run_id?: string | null;
  target_user_id?: string | null;
  target_booking_id?: string | null;
  target_meeting_id?: string | null;
  caller_service_id: string;
  caller_kid: string;
  passed?: boolean | null;
  missing?: string[] | null;
  error_code?: string | null;
  latency_ms?: number | null;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log insert. Failure of audit insert NIE blokuje
 * response — audit jest pomocniczy, a user request który już dostał
 * valid gate check nie powinien failować przez audit error.
 *
 * Zwraca Promise ale wywołujący nie musi await'ować — log w sentry przy error.
 */
export async function logProcessingExportAudit(
  db: SupabaseClient,
  entry: ProcessingAuditEntry,
): Promise<void> {
  try {
    const { error } = await db.from('processing_export_audit').insert({
      type: entry.type,
      processing_run_id: entry.processing_run_id ?? null,
      target_user_id: entry.target_user_id ?? null,
      target_booking_id: entry.target_booking_id ?? null,
      target_meeting_id: entry.target_meeting_id ?? null,
      caller_service_id: entry.caller_service_id,
      caller_kid: entry.caller_kid,
      passed: entry.passed ?? null,
      missing: entry.missing ?? null,
      error_code: entry.error_code ?? null,
      latency_ms: entry.latency_ms ?? null,
      details: entry.details ?? {},
    });
    if (error) {
      console.error('[processing-audit] insert failed:', error.message, entry);
    }
  } catch (err) {
    console.error('[processing-audit] exception:', err, entry);
  }
}
