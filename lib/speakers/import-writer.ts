/**
 * Zapisywanie importu segmentów zgodnie z kontraktem 094:
 *   - tworzy import (status=processing), dezaktywuje poprzedni aktywny,
 *     wrzuca segmenty, aktywuje import (is_active=true, status=ready).
 *   - idempotencja przez source_job_key: kolejne wywołanie z tym samym
 *     kluczem zwraca istniejący import bez duplikacji.
 *
 * Tabela nie ma RLS (service_role only), wywołuj z endpointu admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DiarizeSegment } from './diarize';

export type ImportSource =
  | 'manual'
  | 'livekit_phase2_pertrack'
  | 'livekit_phase2_diarize'
  | 'archival_diarize';

export interface WriteImportParams {
  db: SupabaseClient;
  sessionTemplateId: string;
  source: ImportSource;
  sourceJobKey?: string | null;
  sourceRef?: string | null;
  createdBy?: string | null;
  segments: DiarizeSegment[];
}

export interface WriteImportResult {
  importId: string;
  segmentsInserted: number;
  deactivatedPrevious: boolean;
  reusedExisting: boolean;
}

export async function writeActiveImport(params: WriteImportParams): Promise<WriteImportResult> {
  const { db, sessionTemplateId, source, sourceJobKey, sourceRef, createdBy, segments } = params;

  // Idempotencja: jeśli istnieje import z tym samym (template, source_job_key), zwróć go.
  if (sourceJobKey) {
    const { data: existing } = await db
      .from('session_speaker_imports')
      .select('id, status, is_active')
      .eq('session_template_id', sessionTemplateId)
      .eq('source_job_key', sourceJobKey)
      .maybeSingle();

    if (existing) {
      return {
        importId: existing.id,
        segmentsInserted: 0,
        deactivatedPrevious: false,
        reusedExisting: true,
      };
    }
  }

  // 1. Stwórz import w stanie processing.
  const { data: imp, error: impErr } = await db
    .from('session_speaker_imports')
    .insert({
      session_template_id: sessionTemplateId,
      source,
      status: 'processing',
      is_active: false,
      source_job_key: sourceJobKey ?? null,
      source_ref: sourceRef ?? null,
      created_by: createdBy ?? null,
    })
    .select('id')
    .single();

  if (impErr || !imp) {
    throw new Error(`insert import failed: ${impErr?.message ?? 'unknown'}`);
  }
  const importId = imp.id as string;

  // 2. Wrzuć segmenty.
  const rows = segments.map((s) => ({
    import_id: importId,
    session_template_id: sessionTemplateId,
    start_sec: s.startSec,
    end_sec: s.endSec,
    speaker_key: s.speakerKey,
    display_name: null,
    role: null,
    text: s.text,
    confidence: s.confidence,
  }));

  if (rows.length > 0) {
    const { error: segErr } = await db.from('session_speaker_segments').insert(rows);
    if (segErr) {
      // Mark import failed — nie zostawiaj processing-a w próżni.
      await db
        .from('session_speaker_imports')
        .update({ status: 'failed', error_code: 'insert_segments', error_message: segErr.message })
        .eq('id', importId);
      throw new Error(`insert segments failed: ${segErr.message}`);
    }
  }

  // 3. Deaktywuj poprzedni aktywny (idx_ssi_one_active_per_template wymaga max 1 aktywnego).
  const { data: prev, error: prevErr } = await db
    .from('session_speaker_imports')
    .select('id')
    .eq('session_template_id', sessionTemplateId)
    .eq('is_active', true)
    .maybeSingle();

  if (prevErr) {
    throw new Error(`query previous active failed: ${prevErr.message}`);
  }

  let deactivatedPrevious = false;
  if (prev && prev.id !== importId) {
    const { error: deactErr } = await db
      .from('session_speaker_imports')
      .update({ is_active: false, status: 'superseded' })
      .eq('id', prev.id);
    if (deactErr) throw new Error(`deactivate previous failed: ${deactErr.message}`);
    deactivatedPrevious = true;
  }

  // 4. Aktywuj nowy import (atomowo względem unique partial indexa — prev już off).
  const { error: actErr } = await db
    .from('session_speaker_imports')
    .update({ is_active: true, status: 'ready' })
    .eq('id', importId);
  if (actErr) throw new Error(`activate import failed: ${actErr.message}`);

  return {
    importId,
    segmentsInserted: rows.length,
    deactivatedPrevious,
    reusedExisting: false,
  };
}
