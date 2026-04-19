/**
 * Shared utilities dla widoczności mówców i transkrypcji w edytorze Momentów.
 *
 * Shape danych 1:1 z GET /api/admin/fragments/sessions/[id]/speakers (PR 1).
 * Kolor jest wyprowadzany KLIENTOWO (rola → paleta; fallback po hashu
 * speaker_key), nie trzymany w DB — patrz migracja 094.
 */

export type SpeakerRole = 'host' | 'client' | 'assistant' | 'unknown';

export type SpeakerSource =
  | 'manual'
  | 'livekit_phase2_pertrack'
  | 'livekit_phase2_diarize';

export interface SpeakerSegment {
  id: string;
  startSec: number;
  endSec: number;
  speakerKey: string;
  displayName: string | null;
  role: SpeakerRole | null;
  text: string | null;
  confidence: number | null;
}

export interface SpeakerSummary {
  speakerKey: string;
  displayName: string | null;
  role: SpeakerRole | null;
  segmentCount: number;
  totalSec: number;
}

export interface ActiveImportInfo {
  id: string;
  source: SpeakerSource;
  status: 'processing' | 'ready' | 'failed' | 'superseded';
  createdAt: string;
}

export interface SpeakersResponse {
  activeImport: ActiveImportInfo | null;
  segments: SpeakerSegment[];
  speakers: SpeakerSummary[];
}

/**
 * Paleta klas Tailwind per rola. Unknown + role=null używa palety kolejkowej
 * po hashu speaker_key, żeby w sesjach grupowych różni nieoznaczeni mówcy
 * dostali odrębne kolory.
 */
const ROLE_COLORS: Record<SpeakerRole, { bar: string; pill: string; ring: string }> = {
  host:      { bar: 'bg-htg-sage',        pill: 'bg-htg-sage/20 text-htg-sage',        ring: 'ring-htg-sage/60' },
  client:    { bar: 'bg-amber-500',       pill: 'bg-amber-500/20 text-amber-400',      ring: 'ring-amber-500/60' },
  assistant: { bar: 'bg-sky-500',         pill: 'bg-sky-500/20 text-sky-400',          ring: 'ring-sky-500/60' },
  unknown:   { bar: 'bg-zinc-500',        pill: 'bg-zinc-500/20 text-zinc-300',        ring: 'ring-zinc-500/60' },
};

const FALLBACK_PALETTE = [
  { bar: 'bg-rose-500',    pill: 'bg-rose-500/20 text-rose-400',       ring: 'ring-rose-500/60' },
  { bar: 'bg-indigo-500',  pill: 'bg-indigo-500/20 text-indigo-400',   ring: 'ring-indigo-500/60' },
  { bar: 'bg-emerald-500', pill: 'bg-emerald-500/20 text-emerald-400', ring: 'ring-emerald-500/60' },
  { bar: 'bg-fuchsia-500', pill: 'bg-fuchsia-500/20 text-fuchsia-400', ring: 'ring-fuchsia-500/60' },
  { bar: 'bg-orange-500',  pill: 'bg-orange-500/20 text-orange-400',   ring: 'ring-orange-500/60' },
  { bar: 'bg-teal-500',    pill: 'bg-teal-500/20 text-teal-400',       ring: 'ring-teal-500/60' },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function speakerColor(
  role: SpeakerRole | null,
  speakerKey: string,
): { bar: string; pill: string; ring: string } {
  if (role && role !== 'unknown') return ROLE_COLORS[role];
  return FALLBACK_PALETTE[hash(speakerKey) % FALLBACK_PALETTE.length];
}

/**
 * Tekst transkrypcji dla Momentu [startSec, endSec].
 *
 * Zbiera wszystkie segmenty, które *przecinają* przedział i skleja je
 * z prefixem "Mówca: " gdy się zmieniają. Dla Momentów czasowo dłuższych
 * niż pojedynczy segment zwraca więcej niż jeden paragraf.
 */
export function fragmentText(
  segments: SpeakerSegment[],
  startSec: number,
  endSec: number,
): Array<{ speakerKey: string; displayName: string | null; role: SpeakerRole | null; text: string }> {
  const overlapping = segments
    .filter((s) => s.text !== null && s.text.trim() !== '' && s.endSec > startSec && s.startSec < endSec)
    .sort((a, b) => a.startSec - b.startSec);

  const out: Array<{ speakerKey: string; displayName: string | null; role: SpeakerRole | null; text: string }> = [];
  for (const s of overlapping) {
    const last = out[out.length - 1];
    const txt = (s.text ?? '').trim();
    if (last && last.speakerKey === s.speakerKey) {
      last.text += ' ' + txt;
    } else {
      out.push({
        speakerKey: s.speakerKey,
        displayName: s.displayName,
        role: s.role,
        text: txt,
      });
    }
  }
  return out;
}

/**
 * Binary search: index pierwszego segmentu obejmującego `sec`
 * (startSec ≤ sec < endSec). Zwraca -1 gdy brak.
 * Założenie: segments posortowane po startSec ASC (endpoint gwarantuje).
 */
export function activeSegmentIdx(segments: SpeakerSegment[], sec: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid];
    if (s.startSec > sec) {
      hi = mid - 1;
    } else if (s.endSec <= sec) {
      lo = mid + 1;
    } else {
      ans = mid;
      break;
    }
  }
  return ans;
}
