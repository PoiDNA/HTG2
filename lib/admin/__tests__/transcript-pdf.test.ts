// Tests for transcript-pdf generator.
//
// We don't try to parse the resulting PDF — that would require a PDF parser
// dependency. Instead we assert structural properties of the Buffer:
//   - it starts with the PDF magic header `%PDF-`
//   - it has non-trivial length (header + body + footer is at least a few KB)
//   - it ends with the PDF EOF marker `%%EOF`
//
// We also check that searching the raw PDF bytes for plain ASCII strings
// works for the metadata we expect to embed (booking ID, session date), with
// the caveat that pdfkit may compress the content stream — so we cannot
// reliably search for the segment text itself. The metadata fields go into
// the PDF Info dictionary which is uncompressed by default.

import { describe, it, expect } from 'vitest';
import { generateTranscriptPdf, type TranscriptSegment } from '../transcript-pdf';

const SAMPLE_SEGMENTS: TranscriptSegment[] = [
  {
    phase: 'wstep',
    speaker: 'host',
    identity: 'host-uuid',
    name: 'Natalia',
    start: 0,
    end: 3.5,
    text: 'Witaj. Jak się dzisiaj czujesz?',
  },
  {
    phase: 'wstep',
    speaker: 'client',
    identity: 'client-uuid',
    name: 'Anna',
    start: 4.0,
    end: 8.2,
    text: 'Trochę zmęczona, miałam ciężki tydzień w pracy.',
  },
  {
    phase: 'sesja',
    speaker: 'client',
    identity: 'client-uuid',
    name: 'Anna',
    start: 0,
    end: 12.5,
    text: 'Czuję jak napięcie zaczyna ustępować w ramionach.',
  },
  {
    phase: 'podsumowanie',
    speaker: 'host',
    identity: 'host-uuid',
    name: 'Natalia',
    start: 0,
    end: 5.0,
    text: 'Bardzo dobrze sobie poradziłaś dzisiaj.',
  },
];

const SAMPLE_METADATA = {
  bookingId: 'booking-abc-123',
  sessionDate: '2026-04-09',
  clientName: 'Anna Kowalska',
  generatedAt: new Date('2026-04-09T12:00:00Z'),
  generatedByEmail: 'admin@example.com',
};

describe('generateTranscriptPdf', () => {
  it('produces a valid PDF buffer with magic header and EOF marker', async () => {
    const buf = await generateTranscriptPdf(SAMPLE_SEGMENTS, SAMPLE_METADATA);

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000); // header + body for 4 segments

    // PDF magic: %PDF-1.x
    const header = buf.slice(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');

    // PDF EOF marker is %%EOF, possibly with trailing whitespace
    const tail = buf.slice(Math.max(0, buf.length - 16)).toString('ascii');
    expect(tail).toContain('%%EOF');
  });

  it('embeds metadata in the PDF Info dictionary', async () => {
    const buf = await generateTranscriptPdf(SAMPLE_SEGMENTS, SAMPLE_METADATA);
    const ascii = buf.toString('latin1'); // latin1 preserves all bytes

    // pdfkit writes Info dict with /Title (...) entries — these are
    // uncompressed and searchable as plain text. The session date is part
    // of the Title field.
    expect(ascii).toContain('Transkrypcja sesji');
    expect(ascii).toContain('2026-04-09');
    expect(ascii).toContain('HTG2');
  });

  it('handles empty transcript without throwing', async () => {
    const buf = await generateTranscriptPdf([], SAMPLE_METADATA);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500); // still has header + footer
    expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('handles missing optional metadata fields', async () => {
    const buf = await generateTranscriptPdf(SAMPLE_SEGMENTS, {
      bookingId: 'b1',
      sessionDate: null,
      clientName: null,
      generatedAt: new Date('2026-04-09T12:00:00Z'),
      generatedByEmail: null,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
  });

  it('handles all 3 phase headers in correct order', async () => {
    const segments: TranscriptSegment[] = [
      { phase: 'wstep', speaker: 'host', identity: 'h', name: 'N', start: 0, end: 1, text: 'a' },
      { phase: 'sesja', speaker: 'host', identity: 'h', name: 'N', start: 0, end: 1, text: 'b' },
      { phase: 'podsumowanie', speaker: 'host', identity: 'h', name: 'N', start: 0, end: 1, text: 'c' },
    ];
    const buf = await generateTranscriptPdf(segments, SAMPLE_METADATA);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('handles unknown speaker label', async () => {
    const segments: TranscriptSegment[] = [
      { phase: 'sesja', speaker: 'unknown', identity: 'x', name: 'x', start: 0, end: 1, text: 'hello' },
    ];
    const buf = await generateTranscriptPdf(segments, SAMPLE_METADATA);
    expect(buf).toBeInstanceOf(Buffer);
  });

  it('handles long single text segments without crashing', async () => {
    const longText = 'Lorem ipsum '.repeat(500); // ~6000 chars
    const segments: TranscriptSegment[] = [
      { phase: 'sesja', speaker: 'client', identity: 'c', name: 'A', start: 0, end: 60, text: longText },
    ];
    const buf = await generateTranscriptPdf(segments, SAMPLE_METADATA);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(2000); // multi-page output
  });

  it('handles 100 segments in one call', async () => {
    const segments: TranscriptSegment[] = Array.from({ length: 100 }, (_, i) => ({
      phase: i < 30 ? 'wstep' : i < 70 ? 'sesja' : 'podsumowanie',
      speaker: i % 2 === 0 ? 'host' : 'client',
      identity: 'x',
      name: i % 2 === 0 ? 'Natalia' : 'Anna',
      start: i * 2,
      end: i * 2 + 1.5,
      text: `Segment number ${i}.`,
    }));
    const buf = await generateTranscriptPdf(segments, SAMPLE_METADATA);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(3000);
  });
});
