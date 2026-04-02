// Session countdown: bucket logic, deterministic phrase selection, and countdown formatting.
// Creative phrases live in messages/pl.json and messages/en.json under Booking.countdown.
// This file handles only logic — no user-facing copy except the numeric formatter
// (formatCountdown), which is kept here because Polish plural declension
// doesn't fit simple i18n keys. Supports only 'pl' | 'en'.

type CountdownBucket = '8plus' | '7' | '6' | '5' | '4' | '3' | '2' | '1' | 'lt1';

export interface CountdownPayload {
  phraseKey: string; // i18n key, e.g. "countdown.3.2"
  months: number;
  days: number;
}

const PHRASES_PER_BUCKET = 5;

function getMonthBucket(months: number): CountdownBucket {
  if (months >= 8) return '8plus';
  if (months >= 7) return '7';
  if (months >= 6) return '6';
  if (months >= 5) return '5';
  if (months >= 4) return '4';
  if (months >= 3) return '3';
  if (months >= 2) return '2';
  if (months >= 1) return '1';
  return 'lt1';
}

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function daysInMonth(year: number, month: number): number {
  // month is 1-based
  return new Date(year, month, 0).getDate();
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

export function calendarDiff(
  fromYmd: string,
  toYmd: string,
): { months: number; days: number } {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);

  let totalMonths = (to.y - from.y) * 12 + (to.m - from.m);
  let days: number;

  if (to.d < from.d) {
    totalMonths -= 1;
    days = daysInMonth(from.y, from.m) - from.d + to.d;
  } else {
    days = to.d - from.d;
  }

  if (totalMonths < 0 || (totalMonths === 0 && days <= 0)) {
    return { months: 0, days: 0 };
  }

  return { months: totalMonths, days };
}

/**
 * Returns countdown payload for a confirmed booking, or null if session
 * is today/in the past (calendar-level check; hour-level guard is in page.tsx).
 */
export function getSessionCountdown(
  bookingId: string,
  slotDate: string,
  todayYmd: string,
): CountdownPayload | null {
  const { months, days } = calendarDiff(todayYmd, slotDate);

  if (months === 0 && days === 0) return null;

  const bucket = getMonthBucket(months);
  const index = simpleHash(bookingId) % PHRASES_PER_BUCKET;

  return {
    phraseKey: `countdown.${bucket}.${index}`,
    months,
    days,
  };
}

// ---------------------------------------------------------------------------
// Numeric countdown formatter (hardcoded — Polish plural declension)
// ---------------------------------------------------------------------------

function plMonths(n: number): string {
  if (n === 1) return '1 miesiąc';
  const lastTwo = n % 100;
  const lastOne = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return `${n} miesięcy`;
  if (lastOne >= 2 && lastOne <= 4) return `${n} miesiące`;
  return `${n} miesięcy`;
}

function plDays(n: number): string {
  if (n === 1) return '1 dzień';
  return `${n} dni`;
}

function enMonths(n: number): string {
  return n === 1 ? '1 month' : `${n} months`;
}

function enDays(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

export function formatCountdown(
  months: number,
  days: number,
  locale: 'pl' | 'en',
): string {
  const parts = formatCountdownParts(months, days, locale);
  if (!parts) return '';
  const lines = [parts.monthsLine, parts.daysLine]
    .filter(Boolean)
    .map(l => l!.number + ' ' + l!.label)
    .join(' ');
  return lines + ' ' + parts.suffix;
}

interface CountdownLine {
  number: string;
  label: string;
}

/** Returns countdown split into number/label pairs for flexible rendering */
export function formatCountdownParts(
  months: number,
  days: number,
  locale: 'pl' | 'en',
): { monthsLine: CountdownLine | null; daysLine: CountdownLine | null; suffix: string } | null {
  const suffix = locale === 'pl' ? 'do sesji' : 'until session';

  function splitNumberLabel(formatted: string): CountdownLine {
    const spaceIdx = formatted.indexOf(' ');
    return {
      number: formatted.slice(0, spaceIdx),
      label: formatted.slice(spaceIdx + 1),
    };
  }

  const fmtMonths = locale === 'pl' ? plMonths : enMonths;
  const fmtDays = locale === 'pl' ? plDays : enDays;

  const monthsLine = months > 0 ? splitNumberLabel(fmtMonths(months)) : null;
  const daysLine = days > 0 ? splitNumberLabel(fmtDays(days)) : null;

  if (!monthsLine && !daysLine) return null;
  return { monthsLine, daysLine, suffix };
}
