/**
 * Normalizes a date input to canonical ISO `YYYY-MM-DD`, or returns `null`.
 *
 * Accepts:
 *  - `YYYY-MM-DD`              — HTML5 `<input type="date">` value
 *  - `YYYY-MM-DDTHH:MM:SS...`  — date prefix from a timestamp string
 *  - `DD.MM.YYYY`              — defensive: Polish display format that may leak into state
 *
 * Rejects values that are not parseable AND values that are calendar-invalid
 * (e.g. `2026-02-31`, `2026-13-01`, `2025-02-29`).
 *
 * Used to make string comparisons (`<`, `>`) safe across mixed input formats.
 */
export function normalizeDateInput(value: string | null | undefined): string | null {
  if (!value) return null;

  let y: number;
  let m: number;
  let d: number;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) {
    y = +iso[1]; m = +iso[2]; d = +iso[3];
  } else {
    const pl = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!pl) return null;
    y = +pl[3]; m = +pl[2]; d = +pl[1];
  }

  // Real calendar validation: roundtrip through Date.UTC catches Feb 31, Apr 31,
  // non-leap Feb 29, month 13, etc.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }

  const yy = String(y).padStart(4, '0');
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
