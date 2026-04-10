/**
 * Dossier builder — normalizuje HTG2 dane do struktury eksportowanej do
 * htg-processing worker service.
 *
 * Implementuje algorytm z planu §3.2:
 * - bookings_used[] filtrowane przez per-booking consent check (capture
 *   granted + template_generation >= 1)
 * - Obsługa natalia_para drugiego uczestnika (join przez consent_records,
 *   nie bookings.user_id)
 * - session_client_insights.client_user_ids TEXT[] matchowany lowercase
 *   dla defensive UUID formatting
 * - scope_key = SHA256(user_id || sorted(bookings_used[]))
 * - consent_fingerprint scope-keyed (sensitive_data globalnie + capture
 *   per booking z template_generation)
 *
 * NIE pobiera audio binarnego (plan I7) — tylko tekstowy transcript z
 * session_client_insights + metadata głosówek z client_recordings.
 *
 * Patrz: docs/processing-service-plan.md §3.2, §3.5
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExportDossierResult {
  user_id: string;
  snapshot_at: string;              // ISO 8601
  export_schema_version: string;    // semver
  scope_key: string;                 // SHA256 hex
  bookings_used: string[];           // sorted UUID list
  consent_fingerprint: string;       // SHA256 hex
  dossier_data: DossierData;
}

export interface DossierData {
  pre: {
    topics: string | null;           // bookings.topics
    before_recordings_meta: RecordingMeta[];
  };
  session: {
    insights: SessionInsight[];      // z session_client_insights
    transcripts_count: number;
  };
  post: {
    after_recordings_meta: RecordingMeta[];
  };
  meetings: MeetingParticipation[];
  history: {
    prior_advisories_count: number;
  };
  provenance: ProvenanceEntry[];
}

export interface RecordingMeta {
  id: string;
  type: 'before' | 'after';
  duration_seconds: number | null;
  created_at: string;
  booking_id: string;
}

export interface SessionInsight {
  booking_id: string;
  live_session_id: string;
  analyzed_at: string | null;
  analysis_model: string | null;
  analysis_prompt_version: string | null;
  // NOTE: full transcript + insights pól nie włączamy do typu tutaj —
  // przekazujemy jako unknown bo struktura jest dynamiczna (JSONB).
  // Klient (worker) parsuje wg swojego schematu.
  transcript: unknown;
  problems: unknown;
  emotional_states: unknown;
  life_events: unknown;
  goals: unknown;
  breakthroughs: unknown;
  journey_summary: string | null;
  summary: string | null;
}

export interface MeetingParticipation {
  meeting_id: string;
  session_id: string;
  joined_at: string | null;
  display_name: string | null;
}

export interface ProvenanceEntry {
  source_table: string;
  source_id: string;
  fetched_at: string;
}

/**
 * Build `bookings_used[]` dla user_id.
 *
 * Query zwraca bookingi gdzie user ma valid capture consent per booking +
 * insights status='ready'. Matchuje drugiego uczestnika natalia_para przez
 * join na consent_records (nie polegamy na bookings.user_id).
 *
 * Lowercase match na client_user_ids TEXT[] chroni przed niespójnym
 * formatowaniem UUID (uppercase vs lowercase dashes).
 */
export async function buildBookingsUsed(
  db: SupabaseClient,
  userId: string,
): Promise<string[]> {
  // Query jest skomplikowany — używamy raw SQL via rpc
  // albo budujemy przez Supabase client. Wariant prostszy (mniej round-trips):
  //
  // 1. Znajdź wszystkie consent_records dla user capture/granted/template>=1
  // 2. Filter bookings z status IN (confirmed, completed)
  // 3. Filter wiersze gdzie istnieją ready insights z user w client_user_ids

  // Krok 1: consent records dla tego usera (capture, granted, template>=1)
  const { data: consents, error: consentErr } = await db
    .from('consent_records')
    .select('booking_id, id, created_at, template_generation, granted')
    .eq('user_id', userId)
    .eq('consent_type', 'session_recording_capture')
    .not('booking_id', 'is', null);

  if (consentErr) throw new Error(`consent_records query failed: ${consentErr.message}`);
  if (!consents || consents.length === 0) return [];

  // Dla każdego booking_id wyciągamy NAJNOWSZY wiersz (consent_current semantics)
  const latestPerBooking = new Map<string, (typeof consents)[number]>();
  for (const row of consents) {
    const bookingId = row.booking_id as string;
    const existing = latestPerBooking.get(bookingId);
    if (
      !existing ||
      new Date(row.created_at as string).getTime() > new Date(existing.created_at as string).getTime() ||
      (row.created_at === existing.created_at && (row.id as string) > (existing.id as string))
    ) {
      latestPerBooking.set(bookingId, row);
    }
  }

  // Filter: latest must be granted=true AND template_generation >= 1
  const validBookingIds = Array.from(latestPerBooking.entries())
    .filter(([, row]) => row.granted === true && (row.template_generation as number) >= 1)
    .map(([bookingId]) => bookingId);

  if (validBookingIds.length === 0) return [];

  // Krok 2: filter bookings by status
  const { data: bookings, error: bookingErr } = await db
    .from('bookings')
    .select('id, status')
    .in('id', validBookingIds)
    .in('status', ['confirmed', 'completed']);

  if (bookingErr) throw new Error(`bookings query failed: ${bookingErr.message}`);
  if (!bookings || bookings.length === 0) return [];

  const confirmedBookingIds = bookings.map((b) => b.id as string);

  // Krok 3: filter bookings gdzie istnieją ready insights z user w client_user_ids
  const { data: insights, error: insightErr } = await db
    .from('session_client_insights')
    .select('booking_id, client_user_ids')
    .in('booking_id', confirmedBookingIds)
    .eq('status', 'ready');

  if (insightErr) throw new Error(`session_client_insights query failed: ${insightErr.message}`);
  if (!insights) return [];

  // Lowercase match na client_user_ids — chroni przed niespójnym formatowaniem UUID
  const userIdLower = userId.toLowerCase();
  const validWithInsights = insights
    .filter((row) => {
      const ids = (row.client_user_ids as string[] | null) ?? [];
      return ids.some((id) => id.toLowerCase() === userIdLower);
    })
    .map((row) => row.booking_id as string);

  // Deterministic sort dla stabilnego scope_key
  return [...new Set(validWithInsights)].sort();
}

/**
 * Compute `scope_key` dla Dossier cache po stronie workera.
 * Format: SHA256(user_id || ':' || sorted(bookings_used).join(','))
 */
export function computeScopeKey(userId: string, bookingsUsed: string[]): string {
  const sorted = [...bookingsUsed].sort();
  const input = `${userId}:${sorted.join(',')}`;
  return createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * Compute `consent_fingerprint` scope-keyed.
 *
 * Hashuje:
 * - sensitive_data globalnie per user (consent_current)
 * - session_recording_capture per booking z bookings_used[] (inline consent_current
 *   per (user, booking))
 *
 * Worker używa tego fingerprintu wyłącznie do purge matching — NIE
 * do skipowania eksportu (I1).
 */
export async function computeConsentFingerprint(
  db: SupabaseClient,
  userId: string,
  bookingsUsed: string[],
): Promise<string> {
  const parts: string[] = [];

  // ── sensitive_data globalnie ──
  const { data: sensitive } = await db
    .from('consent_records')
    .select('id, granted, template_generation, created_at')
    .eq('user_id', userId)
    .eq('consent_type', 'sensitive_data')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (!sensitive || sensitive.length === 0) {
    parts.push('absent:sensitive_data');
  } else {
    const s = sensitive[0];
    parts.push(
      `sensitive:${s.id}:${s.granted}:${s.template_generation}:${s.created_at}`,
    );
  }

  // ── session_recording_capture per booking (sorted) ──
  parts.push('|captures:');
  const sortedBookings = [...bookingsUsed].sort();
  const captureParts: string[] = [];

  for (const bookingId of sortedBookings) {
    const { data: capture } = await db
      .from('consent_records')
      .select('id, granted, template_generation, created_at')
      .eq('user_id', userId)
      .eq('booking_id', bookingId)
      .eq('consent_type', 'session_recording_capture')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);

    if (!capture || capture.length === 0) {
      captureParts.push(`absent:${bookingId}`);
    } else {
      const c = capture[0];
      captureParts.push(
        `${bookingId}:${c.id}:${c.granted}:${c.template_generation}:${c.created_at}`,
      );
    }
  }

  parts.push(captureParts.join(';'));

  const input = parts.join('');
  return createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * Build full Dossier snapshot dla (user_id, bookings_used[]).
 *
 * Dossier zawiera:
 * - bookings.topics (pre-session points)
 * - session_client_insights dla wszystkich bookings_used (transcript + insights)
 * - client_recordings metadane (bez audio binarnego, bez transcriptów w MVP)
 * - htg_meeting_participants + sessions (participation w Spotkaniach)
 * - prior_advisories_count (count z processing_advisories)
 * - provenance list
 *
 * NIE pobiera: audio files, htg_participant_profiles.admin_notes,
 * htg_speaking_events text turns (Phase 2 deliverable).
 */
export async function buildDossierData(
  db: SupabaseClient,
  userId: string,
  primaryBookingId: string | null,
  bookingsUsed: string[],
): Promise<DossierData> {
  const provenance: ProvenanceEntry[] = [];
  const nowIso = new Date().toISOString();

  // ── Topics z bookings.topics dla primary booking (UC2) lub wszystkich (UC1) ──
  const topicsBookingIds = primaryBookingId ? [primaryBookingId] : bookingsUsed;
  let topics: string | null = null;
  if (topicsBookingIds.length > 0) {
    const { data: bookingRow } = await db
      .from('bookings')
      .select('id, topics')
      .in('id', topicsBookingIds)
      .limit(1)
      .maybeSingle();
    if (bookingRow) {
      topics = (bookingRow.topics as string | null) ?? null;
      provenance.push({ source_table: 'bookings', source_id: bookingRow.id as string, fetched_at: nowIso });
    }
  }

  // ── client_recordings metadata (before + after) dla wszystkich bookings_used ──
  const recordingsMeta: RecordingMeta[] = [];
  if (bookingsUsed.length > 0) {
    const { data: recordings } = await db
      .from('client_recordings')
      .select('id, type, duration_seconds, created_at, booking_id')
      .eq('user_id', userId)
      .in('booking_id', bookingsUsed)
      .is('deleted_at', null);

    if (recordings) {
      for (const r of recordings) {
        recordingsMeta.push({
          id: r.id as string,
          type: r.type as 'before' | 'after',
          duration_seconds: r.duration_seconds as number | null,
          created_at: r.created_at as string,
          booking_id: r.booking_id as string,
        });
        provenance.push({ source_table: 'client_recordings', source_id: r.id as string, fetched_at: nowIso });
      }
    }
  }

  const beforeRecs = recordingsMeta.filter((r) => r.type === 'before');
  const afterRecs = recordingsMeta.filter((r) => r.type === 'after');

  // ── session_client_insights dla wszystkich bookings_used ──
  const insights: SessionInsight[] = [];
  if (bookingsUsed.length > 0) {
    const { data: insightRows } = await db
      .from('session_client_insights')
      .select(
        'booking_id, live_session_id, analyzed_at, analysis_model, analysis_prompt_version, transcript, problems, emotional_states, life_events, goals, breakthroughs, journey_summary, summary',
      )
      .in('booking_id', bookingsUsed)
      .eq('status', 'ready');

    if (insightRows) {
      for (const row of insightRows) {
        insights.push({
          booking_id: row.booking_id as string,
          live_session_id: row.live_session_id as string,
          analyzed_at: row.analyzed_at as string | null,
          analysis_model: row.analysis_model as string | null,
          analysis_prompt_version: row.analysis_prompt_version as string | null,
          transcript: row.transcript,
          problems: row.problems,
          emotional_states: row.emotional_states,
          life_events: row.life_events,
          goals: row.goals,
          breakthroughs: row.breakthroughs,
          journey_summary: row.journey_summary as string | null,
          summary: row.summary as string | null,
        });
        provenance.push({
          source_table: 'session_client_insights',
          source_id: row.live_session_id as string,
          fetched_at: nowIso,
        });
      }
    }
  }

  // ── htg_meeting_participants (join przez sessions dla meeting_id) ──
  const meetings: MeetingParticipation[] = [];
  const { data: participantRows } = await db
    .from('htg_meeting_participants')
    .select(
      'session_id, joined_at, display_name, htg_meeting_sessions!inner(id, meeting_id)',
    )
    .eq('user_id', userId)
    .eq('status', 'joined');

  if (participantRows) {
    for (const row of participantRows) {
      const session = (row as unknown as {
        htg_meeting_sessions: { id: string; meeting_id: string } | null;
      }).htg_meeting_sessions;
      if (session) {
        meetings.push({
          meeting_id: session.meeting_id,
          session_id: session.id,
          joined_at: row.joined_at as string | null,
          display_name: row.display_name as string | null,
        });
        provenance.push({ source_table: 'htg_meeting_participants', source_id: session.id, fetched_at: nowIso });
      }
    }
  }

  // ── prior_advisories_count ──
  let priorAdvisoriesCount = 0;
  const { count: advCount } = await db
    .from('processing_advisories')
    .select('id', { count: 'exact', head: true })
    .eq('subject_user_id', userId);
  priorAdvisoriesCount = advCount ?? 0;

  return {
    pre: {
      topics,
      before_recordings_meta: beforeRecs,
    },
    session: {
      insights,
      transcripts_count: insights.length,
    },
    post: {
      after_recordings_meta: afterRecs,
    },
    meetings,
    history: {
      prior_advisories_count: priorAdvisoriesCount,
    },
    provenance,
  };
}

export const EXPORT_SCHEMA_VERSION = '1.0.0';
