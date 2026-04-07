/**
 * Shared parsing utilities for recording import from Bunny Storage.
 * Used by scan-bunny API and import-historical-recordings script.
 */

const AUDIO_VIDEO_EXTS = /\.(m4v|mp4|mp3|m4a|wav|aac|webm)$/i;

export const FOLDER_ALLOWLIST = ['htg-sessions-arch-03-2026', '1-1'];

export function isAudioVideoFile(filename: string): boolean {
  return AUDIO_VIDEO_EXTS.test(filename);
}

export function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

export function parseDate(filename: string): string | null {
  const f = safeDecode(filename);
  // New format: "1-1 20260330 12-00 ..." or "1-1 20260330_12-00 ..."
  const compact = f.match(/\b(\d{4})(\d{2})(\d{2})[\s_]+\d{2}-\d{2}\b/);
  if (compact) {
    const [, y, m, d] = compact;
    if (isValidDate(+y, +m, +d)) return `${y}-${m}-${d}`;
  }
  // Old/Live format: "2025-04-24 ..." or "... Live 2025-04-24 ..."
  const iso = f.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    if (isValidDate(+y, +m, +d)) return `${y}-${m}-${d}`;
  }
  return null;
}

export function inferSessionType(filename: string): string | null {
  const lower = safeDecode(filename).toLowerCase();
  if (/\b(1-1|1:1|solo)\b/.test(lower) || lower.startsWith('sesja 1-1')) return 'natalia_solo';
  if (/\bagata\b/.test(lower)) return 'natalia_agata';
  if (/\bjustyna\b/.test(lower)) return 'natalia_justyna';
  if (/\bpara\b/.test(lower)) return 'natalia_para';
  if (/\basysta\b/.test(lower)) return 'natalia_asysta';
  if (/\bpre\b/.test(lower)) return 'pre_session';
  return null;
}

export function extractEmail(filename: string): string | null {
  const decoded = safeDecode(filename);
  const match = decoded.match(/\b([\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].toLowerCase().trim() : null;
}

function isValidDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function computeExpiresAt(sessionDate: string | null): string {
  const importExpiry = Date.now() + 30 * 86400000;
  if (!sessionDate) return new Date(importExpiry).toISOString();
  const sessionExpiry = new Date(sessionDate + 'T12:00:00Z').getTime() + 365 * 86400000;
  return new Date(Math.max(sessionExpiry, importExpiry)).toISOString();
}

export function daysDiff(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((da - db) / 86400000);
}
