import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/admin/fragments/sessions/[sessionId]/speakers
 *
 * Read model dla edytora Momentów: aktywny import + segmenty + agregat speakers.
 * Kontrakt v2 (migracja 094):
 *   - Zwraca wyłącznie dane z aktywnego importu (is_active = true, status = 'ready').
 *   - Brak aktywnego importu → activeImport: null, segments: [], speakers: [].
 *   - 404 tylko gdy session_template nie istnieje.
 *
 * Agregacja `speakers` (server-side, denormalizacja jest akceptowana w v2):
 *   - grupowanie po speaker_key w obrębie aktywnego importu
 *   - displayName: wartość z najdłuższym totalSec spośród nie-null; konflikt nierozstrzygalny → null
 *   - role: wartość z najdłuższym totalSec spośród nie-null; konflikt nierozstrzygalny → null
 */

type Params = { params: Promise<{ sessionId: string }> };

type SegmentRow = {
  id: string;
  start_sec: string | number;
  end_sec: string | number;
  speaker_key: string;
  display_name: string | null;
  role: 'host' | 'client' | 'assistant' | 'unknown' | null;
  text: string | null;
  confidence: string | number | null;
};

type ImportRow = {
  id: string;
  source: 'manual' | 'livekit_phase2_pertrack' | 'livekit_phase2_diarize';
  status: 'processing' | 'ready' | 'failed' | 'superseded';
  created_at: string;
};

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v);
}

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

type Role = 'host' | 'client' | 'assistant' | 'unknown';

function pickLongestNonNull<T extends string>(
  entries: Array<{ value: T | null; weight: number }>,
): T | null {
  const totals = new Map<T, number>();
  for (const e of entries) {
    if (e.value === null) continue;
    totals.set(e.value, (totals.get(e.value) ?? 0) + e.weight);
  }
  if (totals.size === 0) return null;
  let best: T | null = null;
  let bestW = -1;
  let tie = false;
  for (const [k, w] of totals.entries()) {
    if (w > bestW) { best = k; bestW = w; tie = false; }
    else if (w === bestW) { tie = true; }
  }
  return tie ? null : best;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  // 1. Weryfikacja czy session_template istnieje (czysty 404 dla nieistniejących).
  const { data: tmpl, error: tmplErr } = await db
    .from('session_templates')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle();

  if (tmplErr) {
    console.error('[admin/speakers] session_templates query failed', { sessionId, error: tmplErr });
    return NextResponse.json({ error: `DB error: ${tmplErr.message}` }, { status: 500 });
  }
  if (!tmpl) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // 2. Aktywny import (≤1 dzięki idx_ssi_one_active_per_template).
  const { data: imp, error: impErr } = await db
    .from('session_speaker_imports')
    .select('id, source, status, created_at')
    .eq('session_template_id', sessionId)
    .eq('is_active', true)
    .maybeSingle();

  if (impErr) {
    console.error('[admin/speakers] imports query failed', { sessionId, error: impErr });
    return NextResponse.json({ error: `DB error: ${impErr.message}` }, { status: 500 });
  }

  if (!imp) {
    return NextResponse.json({ activeImport: null, segments: [], speakers: [] });
  }

  const activeImport = imp as ImportRow;

  // 3. Segmenty aktywnego importu.
  const { data: segs, error: segErr } = await db
    .from('session_speaker_segments')
    .select('id, start_sec, end_sec, speaker_key, display_name, role, text, confidence')
    .eq('import_id', activeImport.id)
    .order('start_sec', { ascending: true });

  if (segErr) {
    console.error('[admin/speakers] segments query failed', {
      sessionId, importId: activeImport.id, error: segErr,
    });
    return NextResponse.json({ error: `DB error: ${segErr.message}` }, { status: 500 });
  }

  const rows = (segs ?? []) as SegmentRow[];

  const segments = rows.map((r) => ({
    id: r.id,
    startSec: num(r.start_sec),
    endSec: num(r.end_sec),
    speakerKey: r.speaker_key,
    displayName: r.display_name,
    role: r.role,
    text: r.text,
    confidence: numOrNull(r.confidence),
  }));

  // 4. Agregat speakers — reguła: najdłuższy totalSec spośród nie-null; konflikt → null.
  const byKey = new Map<string, {
    speakerKey: string;
    segmentCount: number;
    totalSec: number;
    names: Array<{ value: string | null; weight: number }>;
    roles: Array<{ value: Role | null; weight: number }>;
  }>();

  for (const s of segments) {
    const dur = Math.max(0, s.endSec - s.startSec);
    const entry = byKey.get(s.speakerKey) ?? {
      speakerKey: s.speakerKey,
      segmentCount: 0,
      totalSec: 0,
      names: [],
      roles: [],
    };
    entry.segmentCount += 1;
    entry.totalSec += dur;
    entry.names.push({ value: s.displayName, weight: dur });
    entry.roles.push({ value: s.role, weight: dur });
    byKey.set(s.speakerKey, entry);
  }

  const speakers = Array.from(byKey.values())
    .map((e) => ({
      speakerKey: e.speakerKey,
      displayName: pickLongestNonNull<string>(e.names),
      role: pickLongestNonNull<Role>(e.roles),
      segmentCount: e.segmentCount,
      totalSec: e.totalSec,
    }))
    .sort((a, b) => b.totalSec - a.totalSec);

  return NextResponse.json({
    activeImport: {
      id: activeImport.id,
      source: activeImport.source,
      status: activeImport.status,
      createdAt: activeImport.created_at,
    },
    segments,
    speakers,
  });
}
