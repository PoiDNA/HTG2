/**
 * lib/staff-config.ts — JEDYNE źródło prawdy o składzie zespołu HTG.
 *
 * Wszystkie inne pliki (lib/roles.ts, admin UI, API routes, migracje)
 * MUSZĄ czerpać dane stąd — nigdy nie wpisuj emaili/slugów na sztywno.
 *
 * Zmiana składu = edycja TYLKO tego pliku + nowa migracja DB jeśli potrzeba.
 */

export type StaffRole = 'admin' | 'practitioner' | 'operator' | 'editor' | 'translator';

export interface StaffMember {
  email: string;
  name: string;
  slug: string;
  role: StaffRole;
  description: string;
  /** Tylko tłumacze */
  locale?: 'en' | 'de' | 'pt';
  /** Kolor w panelu admina */
  color?: string;
}

export const STAFF = [
  // ─── Administrator ──────────────────────────────────────────────────────────
  {
    email: 'htg@htg.cyou',
    name: 'HTG',
    slug: 'htg',
    role: 'admin' as const,
    description: 'Administrator',
  },

  // ─── Prowadząca ─────────────────────────────────────────────────────────────
  {
    email: 'natalia@htg.cyou',
    name: 'Natalia',
    slug: 'natalia',
    role: 'practitioner' as const,
    description: 'Prowadząca sesje',
    color: 'bg-htg-indigo',
  },

  // ─── Operatorki (uczestniczą w sesjach z asystą, mówią po polsku) ───────────
  {
    email: 'agata@htg.cyou',
    name: 'Agata',
    slug: 'agata',
    role: 'operator' as const,
    description: 'Operatorka',
    color: 'bg-htg-sage',
  },
  {
    email: 'justyna@htg.cyou',
    name: 'Justyna',
    slug: 'justyna',
    role: 'operator' as const,
    description: 'Operatorka',
    color: 'bg-htg-sage',
  },
  {
    email: 'przemek@htg.cyou',
    name: 'Przemek',
    slug: 'przemek',
    role: 'operator' as const,
    description: 'Operator',
    color: 'bg-htg-sage',
  },

  // ─── Edytorki (publikacja i edycja treści) ──────────────────────────────────
  {
    email: 'marta@htg.cyou',
    name: 'Marta',
    slug: 'marta',
    role: 'editor' as const,
    description: 'Edytorka',
    color: 'bg-htg-warm',
  },
  {
    email: 'anna@htg.cyou',
    name: 'Ania',
    slug: 'ania',
    role: 'editor' as const,
    description: 'Edytorka',
    color: 'bg-htg-warm',
  },
  {
    email: 'bianka@htg.cyou',
    name: 'Dominika',
    slug: 'dominika',
    role: 'editor' as const,
    description: 'Edytorka',
    color: 'bg-htg-warm',
  },

  // ─── Tłumacze ───────────────────────────────────────────────────────────────
  {
    email: 'melania@htg.cyou',
    name: 'Melania',
    slug: 'melania',
    role: 'translator' as const,
    locale: 'en' as const,
    description: 'Tłumaczka EN',
    color: 'bg-htg-lavender',
  },
  {
    email: 'bernadetta@htg.cyou',
    name: 'Bernadetta',
    slug: 'bernadetta',
    role: 'translator' as const,
    locale: 'de' as const,
    description: 'Tłumaczka DE',
    color: 'bg-htg-lavender',
  },
  {
    email: 'edytap@htg.cyou',
    name: 'Edyta',
    slug: 'edytap',
    role: 'translator' as const,
    locale: 'pt' as const,
    description: 'Tłumaczka PT',
    color: 'bg-htg-lavender',
  },
] satisfies StaffMember[];

// ─── Widoki pochodne ────────────────────────────────────────────────────────

export const staffByRole = (role: StaffRole): StaffMember[] =>
  STAFF.filter(s => s.role === role);

export const translators = STAFF.filter(s => s.role === 'translator') as (StaffMember & { locale: 'en' | 'de' | 'pt' })[];

// ─── Sesje panel access (sesje.htg.cyou) ────────────────────────────────────
// Edytorzy panelu sesji — mogą tworzyć i edytować wszystkie sesje,
// ale tylko admin (htg@htg.cyou) może je usuwać.
export const SESJE_EDITORS: readonly string[] = [
  'natalia@htg.cyou',
  'agata@htg.cyou',
  'przemek@htg.cyou',
  'operator@htg.cyou',
  'htg@htg.cyou',
];

export const SESJE_ADMIN = 'htg@htg.cyou';

export function canEditSesje(email: string | null | undefined): boolean {
  if (!email) return false;
  return SESJE_EDITORS.includes(email.toLowerCase());
}

export function canDeleteSesje(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === SESJE_ADMIN;
}
