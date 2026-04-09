'use client';

// ============================================================================
// TranscriptAccordion
//
// Per-row accordion in the admin recordings table that shows the raw
// transcript for the booking on demand. Two affordances:
//   - "Pokaż transkrypcję" toggle button — fetches GET /api/admin/insights/[id]
//     on first expand, then keeps the data cached for the duration of the
//     page session
//   - "Pobierz PDF" link — opens GET /api/admin/insights/[id]/pdf in a new tab
//     so the browser handles the download via Content-Disposition
//
// We render NOTHING (return null) if the parent passes hasInsights=false —
// the toggle is hidden for bookings without analyzed insights so admins
// don't waste a click on rows that have nothing to show.
//
// Audit: BOTH endpoints log via auditInsightsAccess on the server side. The
// client component does no audit logging itself.
//
// Privacy: the transcript is fetched on demand only when the admin clicks
// "Pokaż" — so a page load alone does not trigger an audit row for every
// row. Only the rows the admin actually expands get an audit entry.
// ============================================================================

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Download, Loader2, AlertCircle } from 'lucide-react';

interface TranscriptSegment {
  phase: 'wstep' | 'sesja' | 'podsumowanie';
  speaker: 'client' | 'host' | 'unknown';
  identity: string;
  name: string;
  start: number;
  end: number;
  text: string;
}

interface InsightsResponse {
  bookingId: string;
  liveSessionId: string;
  transcript: TranscriptSegment[];
  journeySummary: string | null;
  summary: string | null;
  analyzedAt: string | null;
  analysisModel: string | null;
}

const PHASE_LABELS: Record<TranscriptSegment['phase'], string> = {
  wstep: 'Wstęp',
  sesja: 'Sesja',
  podsumowanie: 'Podsumowanie',
};

const PHASE_COLORS: Record<TranscriptSegment['phase'], string> = {
  wstep: 'text-blue-400',
  sesja: 'text-htg-sage',
  podsumowanie: 'text-orange-400',
};

const SPEAKER_LABELS: Record<TranscriptSegment['speaker'], string> = {
  client: 'Klient',
  host: 'Prowadząca',
  unknown: 'Nieznany',
};

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface Props {
  bookingId: string;
  hasInsights: boolean;
}

export default function TranscriptAccordion({ bookingId, hasInsights }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InsightsResponse | null>(null);

  if (!hasInsights) {
    return null;
  }

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (data || loading) return; // already loaded or loading

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/insights/${bookingId}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as InsightsResponse;
      setData(json);
    } catch (e) {
      setError((e as Error)?.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1 text-xs text-htg-sage hover:text-htg-sage/80 transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <FileText className="w-3 h-3" />
          {expanded ? 'Ukryj transkrypcję' : 'Pokaż transkrypcję'}
        </button>

        {expanded && data && (
          <a
            href={`/api/admin/insights/${bookingId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-htg-sage hover:text-htg-sage/80 transition-colors"
          >
            <Download className="w-3 h-3" />
            Pobierz PDF
          </a>
        )}
      </div>

      {expanded && (
        <div className="mt-3 p-4 bg-htg-surface/50 rounded-lg border border-htg-card-border">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-htg-fg-muted text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Ładowanie transkrypcji...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 py-2 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {data && data.transcript.length === 0 && (
            <div className="text-htg-fg-muted text-xs italic py-2">
              Transkrypcja jest pusta.
            </div>
          )}

          {data && data.transcript.length > 0 && (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {data.transcript.map((segment, idx) => {
                const prevPhase = idx > 0 ? data.transcript[idx - 1].phase : null;
                const showPhaseHeader = segment.phase !== prevPhase;
                return (
                  <div key={idx}>
                    {showPhaseHeader && (
                      <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${PHASE_COLORS[segment.phase]}`}>
                        ── {PHASE_LABELS[segment.phase]} ──
                      </div>
                    )}
                    <div className="text-xs">
                      <span className="font-semibold text-htg-fg">
                        {SPEAKER_LABELS[segment.speaker]}
                        {segment.name && segment.name !== SPEAKER_LABELS[segment.speaker] && ` (${segment.name})`}
                      </span>
                      <span className="text-htg-fg-muted ml-1">
                        [{formatTimestamp(segment.start)}]
                      </span>
                      <p className="text-htg-fg mt-0.5 leading-relaxed">{segment.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {data && (
            <div className="mt-3 pt-2 border-t border-htg-card-border/50 text-[10px] text-htg-fg-muted">
              {data.transcript.length} segmentów •{' '}
              {data.analysisModel && <>model: {data.analysisModel} • </>}
              {data.analyzedAt && <>analiza: {new Date(data.analyzedAt).toLocaleString('pl-PL')}</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
