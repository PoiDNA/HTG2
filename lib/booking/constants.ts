import type { SessionType } from './types';

export const SESSION_CONFIG: Record<SessionType, {
  label: string;
  labelShort: string;
  durationMinutes: number;
  pricePln: number;
  requiredStaff: string[];  // staff slugs
  color: string;            // tailwind color class
  maxClients?: number;      // max clients per session (default 1)
}> = {
  natalia_solo: {
    label: 'Sesja 1:1 z Natalią',
    labelShort: '1:1 Natalia',
    durationMinutes: 120,
    pricePln: 1200,
    requiredStaff: ['natalia'],
    color: 'bg-htg-indigo',
  },
  natalia_agata: {
    label: 'Sesja z Natalią i Agatą',
    labelShort: 'Natalia + Agata',
    durationMinutes: 90,
    pricePln: 1600,
    requiredStaff: ['natalia', 'agata'],
    color: 'bg-htg-sage',
  },
  natalia_justyna: {
    label: 'Sesja z Natalią i Justyną',
    labelShort: 'Natalia + Justyna',
    durationMinutes: 90,
    pricePln: 1600,
    requiredStaff: ['natalia', 'justyna'],
    color: 'bg-htg-warm',
  },
  natalia_przemek: {
    label: 'Sesja z Natalią i Przemkiem',
    labelShort: 'Natalia + Przemek',
    durationMinutes: 90,
    pricePln: 1600,
    requiredStaff: ['natalia', 'przemek'],
    color: 'bg-sky-600',
  },
  natalia_para: {
    label: 'Sesja dla par',
    labelShort: 'Sesja dla par',
    durationMinutes: 120,
    pricePln: 1600,
    requiredStaff: ['natalia'],
    color: 'bg-rose-600',
    maxClients: 2,
  },
  natalia_asysta: {
    label: 'Sesja z Asystą',
    labelShort: 'Z Asystą',
    durationMinutes: 90,
    pricePln: 1600,
    requiredStaff: ['natalia', 'operator'],
    color: 'bg-amber-600',
  },
  pre_session: {
    label: 'Spotkanie wstępne (15 min)',
    labelShort: 'Spotkanie wstępne',
    durationMinutes: 15,
    pricePln: 0,
    requiredStaff: [],  // only the specific assistant — set at slot level
    color: 'bg-purple-600',
  },
  natalia_interpreter: {
    // DEPRECATED legacy type (120 min). Kept in the enum to support historic
    // bookings. New flow uses natalia_interpreter_{solo,asysta,para} (180 min).
    label: 'Session with interpreter (legacy)',
    labelShort: 'Natalia + interpreter (legacy)',
    durationMinutes: 120,
    pricePln: 0,
    requiredStaff: ['natalia'],
    color: 'bg-htg-warm',
  },
  natalia_interpreter_solo: {
    label: 'Session with interpreter',
    labelShort: 'Natalia + interpreter',
    durationMinutes: 180,
    pricePln: 0,  // EN/DE/PT have their own prices in EUR/USD via sessions table
    requiredStaff: ['natalia'],
    color: 'bg-htg-warm',
  },
  natalia_interpreter_asysta: {
    label: 'Session with assistance + interpreter',
    labelShort: 'Assistance + interpreter',
    durationMinutes: 180,
    pricePln: 0,
    requiredStaff: ['natalia'],  // assistant_id picked at slot level
    color: 'bg-amber-600',
  },
  natalia_interpreter_para: {
    label: 'Couples session with interpreter',
    labelShort: 'Couples + interpreter',
    durationMinutes: 180,
    pricePln: 0,
    requiredStaff: ['natalia'],
    color: 'bg-rose-600',
    maxClients: 2,
  },
};

/** Locale → ISO 4217 currency code */
export const LOCALE_CURRENCY: Record<string, string> = {
  pl: 'pln',
  en: 'usd',
  de: 'eur',
  pt: 'eur',
};

export const PRODUCT_SLUGS = {
  YEARLY:              'pakiet-roczny',
  MONTHLY:             'pakiet-miesieczny',
  SINGLE_SESSION:      'sesja-pojedyncza',
  SESSION_1ON1:        'sesja-natalia',
  SESSION_AGATA:       'sesja-natalia-agata',
  SESSION_ASYSTA:      'sesja-natalia-agata',  // alias: reuses Agata product (same price)
  SESSION_JUSTYNA:     'sesja-natalia-justyna',
  SESSION_PARA:        'sesja-natalia-para',
  SESSION_INTERPRETER: 'sesja-natalia-tlumacz',
} as const;

// Includes all session types ever used (including deprecated `natalia_interpreter`)
// for historic reporting. UI should iterate BOOKABLE_SESSION_TYPES instead.
export const ALL_SESSION_TYPES: SessionType[] = [
  'natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_przemek',
  'natalia_para', 'natalia_asysta',
  'natalia_interpreter',  // deprecated — kept for historic bookings
  'natalia_interpreter_solo', 'natalia_interpreter_asysta', 'natalia_interpreter_para',
];

// Session types that can be newly booked via SessionPicker / booking flow.
// Excludes deprecated `natalia_interpreter` and `pre_session` (separate flow).
export const BOOKABLE_SESSION_TYPES: SessionType[] = [
  'natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_przemek',
  'natalia_para', 'natalia_asysta',
  'natalia_interpreter_solo', 'natalia_interpreter_asysta', 'natalia_interpreter_para',
];

// Interpreter variant session types (180 min, require translator_id).
export const INTERPRETER_SESSION_TYPES: SessionType[] = [
  'natalia_interpreter_solo', 'natalia_interpreter_asysta', 'natalia_interpreter_para',
];

export function isInterpreterSessionType(t: SessionType): boolean {
  return INTERPRETER_SESSION_TYPES.includes(t);
}

export const PRE_SESSION_DURATION = 15;

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  confirmed_paid:       'Opłacona',
  installments:         'Raty',
  partial_payment:      'Niepełna płatność',
  pending_verification: 'Do potwierdzenia',
};

// Days of week (0=Sunday) — Polish labels
export const DAY_LABELS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
export const DAY_LABELS_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

// Hold duration
export const HOLD_HOURS = 24;

// Working hours range for calendar display
export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 20;

// Time to end time calculation
export function slotEndTime(startTime: string, sessionType: SessionType): string {
  const [h, m] = startTime.split(':').map(Number);
  const duration = SESSION_CONFIG[sessionType].durationMinutes;
  const totalMin = h * 60 + m + duration;
  const endH = Math.floor(totalMin / 60);
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

// Monthly packages naming helpers
export const MONTH_NAMES_PL: Record<string, string> = {
  '01': 'Styczeń', '02': 'Luty', '03': 'Marzec', '04': 'Kwiecień',
  '05': 'Maj', '06': 'Czerwiec', '07': 'Lipiec', '08': 'Sierpień',
  '09': 'Wrzesień', '10': 'Październik', '11': 'Listopad', '12': 'Grudzień',
};

/** "Maj 2024" — PL-only fallback when monthly_sets.title is unavailable. */
export function formatSesjeMonthPl(scopeMonth: string): string {
  const [y, mm] = scopeMonth.split('-');
  return `${MONTH_NAMES_PL[mm] || mm} ${y}`;
}
