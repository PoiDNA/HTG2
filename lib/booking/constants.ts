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

export const ALL_SESSION_TYPES: SessionType[] = ['natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_para', 'natalia_asysta'];
export const PRE_SESSION_DURATION = 15;

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
