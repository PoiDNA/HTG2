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
    requiredStaff: ['natalia'],
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
};

export const PRODUCT_SLUGS = {
  YEARLY:              'pakiet-roczny',
  MONTHLY:             'pakiet-miesieczny',
  SINGLE_SESSION:      'sesja-pojedyncza',
  SESSION_1ON1:        'sesja-natalia',
  SESSION_AGATA:       'sesja-natalia-agata',
  SESSION_JUSTYNA:     'sesja-natalia-justyna',
  SESSION_PARA:        'sesja-natalia-para',
} as const;

export const ALL_SESSION_TYPES: SessionType[] = ['natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_para', 'natalia_asysta'];
export const PRE_SESSION_DURATION = 15;

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  confirmed_paid:       'Opłacona',
  installments:         'Raty',
  partial_payment:      'Niepełna płatność',
  pending_verification: 'Do potwierdzenia',
};

export const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid:       { label: PAYMENT_STATUS_LABELS.confirmed_paid,       className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  installments:         { label: PAYMENT_STATUS_LABELS.installments,         className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  partial_payment:      { label: PAYMENT_STATUS_LABELS.partial_payment,      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  pending_verification: { label: PAYMENT_STATUS_LABELS.pending_verification, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
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
