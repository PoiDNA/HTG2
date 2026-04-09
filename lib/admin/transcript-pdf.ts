// ============================================================================
// Transcript PDF generator
//
// Generates a printable PDF of a single session transcript using pdfkit.
// Scope: raw transcript only — speaker labels, phase markers, timestamps.
// Does NOT include AI-extracted insights (problems, emotions, ...) — those
// are admin-internal data and the PDF is meant to be a clean, shareable
// transcript document.
//
// Returns a Buffer (in-memory PDF). For sessions with very long transcripts
// the buffer can be large; pdfkit streams internally so memory usage is
// proportional to the final PDF size, not multiplied. For typical 1-hour
// sessions expect ~50-200 KB.
// ============================================================================

import PDFDocument from 'pdfkit';

/**
 * One transcript segment as stored in session_client_insights.transcript JSONB.
 * Mirrors the SpeakerSegment type from lib/client-analysis/types.ts.
 */
export interface TranscriptSegment {
  phase: 'wstep' | 'sesja' | 'podsumowanie';
  speaker: 'client' | 'host' | 'unknown';
  /** LiveKit participant identity (UUID). Internal — not shown in PDF. */
  identity: string;
  /** Display name resolved from profiles/staff_members at analysis time. */
  name: string;
  /** Seconds from start of the phase recording. */
  start: number;
  /** Seconds from start of the phase recording. */
  end: number;
  /** Text spoken in this segment. */
  text: string;
}

export interface TranscriptPdfMetadata {
  bookingId: string;
  sessionDate: string | null;
  clientName: string | null;
  generatedAt: Date;
  generatedByEmail: string | null;
}

const PHASE_LABELS: Record<TranscriptSegment['phase'], string> = {
  wstep: 'Wstęp',
  sesja: 'Sesja',
  podsumowanie: 'Podsumowanie',
};

const SPEAKER_LABELS: Record<TranscriptSegment['speaker'], string> = {
  client: 'Klient',
  host: 'Prowadząca',
  unknown: 'Nieznany',
};

/**
 * Format seconds as M:SS — used for phase-relative timestamps in the PDF.
 * Examples: 0 → "0:00", 65 → "1:05", 3661 → "61:01"
 */
function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Build a printable PDF of a transcript. Returns a Buffer that the caller
 * can stream as a response body.
 *
 * The PDF is intentionally simple: one column, large text, no styling beyond
 * bold for speaker labels and a phase header before each phase block. This
 * matches the "raw transcript only" requirement and makes the document easy
 * to print and read offline.
 *
 * Polish characters: pdfkit's default Helvetica font has full Latin-1
 * coverage which includes ą ć ę ł ń ó ś ź ż. No custom font needed.
 */
export async function generateTranscriptPdf(
  segments: TranscriptSegment[],
  metadata: TranscriptPdfMetadata,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // pdfkit's font subsystem requires AFM files at runtime. The default
    // Helvetica is bundled and works without filesystem access — important
    // for serverless/edge deployments where node_modules layout differs.
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Transkrypcja sesji ${metadata.sessionDate ?? metadata.bookingId}`,
        Author: 'HTG2',
        Subject: 'Transkrypcja sesji HTG',
        Producer: 'HTG2 admin panel',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ─── Header ─────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18).text('Transkrypcja sesji HTG', { align: 'center' });
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(10).fillColor('#444');
    if (metadata.sessionDate) {
      doc.text(`Data sesji: ${metadata.sessionDate}`, { align: 'center' });
    }
    if (metadata.clientName) {
      doc.text(`Klient: ${metadata.clientName}`, { align: 'center' });
    }
    doc.text(
      `Wygenerowano: ${metadata.generatedAt.toLocaleString('pl-PL')}` +
        (metadata.generatedByEmail ? ` przez ${metadata.generatedByEmail}` : ''),
      { align: 'center' },
    );
    doc.fillColor('#000');
    doc.moveDown(1);

    // Privacy notice — small print
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666');
    doc.text(
      'Dokument zawiera dane szczególnej kategorii (RODO art. 9). ' +
        'Dostęp i przetwarzanie wyłącznie zgodnie z obowiązującymi zgodami klienta. ' +
        'Wszystkie dostępy są audytowane.',
      { align: 'center' },
    );
    doc.fillColor('#000');
    doc.moveDown(1.5);

    // ─── Body ───────────────────────────────────────────────────────────────
    if (segments.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(11).fillColor('#999');
      doc.text('(Transkrypcja jest pusta — brak mowy w tej sesji.)', { align: 'center' });
    } else {
      let lastPhase: TranscriptSegment['phase'] | null = null;

      for (const segment of segments) {
        // Phase header — printed once before the first segment of each phase
        if (segment.phase !== lastPhase) {
          if (lastPhase !== null) {
            doc.moveDown(0.8);
          }
          doc.font('Helvetica-Bold').fontSize(13).fillColor('#5b8a72'); // htg-sage
          doc.text(`── ${PHASE_LABELS[segment.phase].toUpperCase()} ──`);
          doc.fillColor('#000');
          doc.moveDown(0.4);
          lastPhase = segment.phase;
        }

        // Speaker line: "Klient (Anna) [0:15]"
        const speakerLabel = SPEAKER_LABELS[segment.speaker];
        const nameSuffix = segment.name && segment.name !== speakerLabel ? ` (${segment.name})` : '';
        const timestamp = formatTimestamp(segment.start);

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#333');
        doc.text(`${speakerLabel}${nameSuffix} [${timestamp}]`, { continued: false });
        doc.fillColor('#000');

        // Text — paragraph with hanging indent for readability
        doc.font('Helvetica').fontSize(11);
        doc.text(segment.text, { indent: 12, paragraphGap: 4, align: 'left' });
      }
    }

    // ─── Footer (last page) ─────────────────────────────────────────────────
    // pdfkit doesn't have native page footers. We add a small ID at the very
    // end so audit trail can correlate the document to a specific access.
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(7).fillColor('#aaa');
    doc.text(`Booking ID: ${metadata.bookingId}`, { align: 'right' });

    doc.end();
  });
}
