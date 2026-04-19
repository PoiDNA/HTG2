/**
 * Dopuszczone tagi dla session_fragments.
 *
 * Źródło prawdy dla:
 *   - UI edytora (chip selector w /konto/admin/momenty/[sessionId])
 *   - filtrów w /konto/momenty (predefinowane Momenty)
 *   - walidacji w API (POST /api/admin/fragments/sessions/[sessionId])
 *
 * Przy dodawaniu nowego tagu: dopisz tutaj + etykietę PL/DE/EN poniżej.
 * Nie trzeba migracji — kolumna `tags text[]` przyjmuje dowolne wartości,
 * filtr w API rzuca 400 dla niedozwolonych.
 */

export const FRAGMENT_TAGS = [
  'relacje',
  'lek',
  'cialo',
  'trauma',
  'granice',
  'emocje',
  'dziecinstwo',
  'praca',
  'sens',
  'strata',
] as const;

export type FragmentTag = typeof FRAGMENT_TAGS[number];

export const FRAGMENT_TAG_LABELS: Record<FragmentTag, { pl: string; de: string; en: string }> = {
  relacje:     { pl: 'Relacje',      de: 'Beziehungen',   en: 'Relationships' },
  lek:         { pl: 'Lęk',          de: 'Angst',         en: 'Anxiety' },
  cialo:       { pl: 'Ciało',        de: 'Körper',        en: 'Body' },
  trauma:      { pl: 'Trauma',       de: 'Trauma',        en: 'Trauma' },
  granice:     { pl: 'Granice',      de: 'Grenzen',       en: 'Boundaries' },
  emocje:      { pl: 'Emocje',       de: 'Emotionen',     en: 'Emotions' },
  dziecinstwo: { pl: 'Dzieciństwo',  de: 'Kindheit',      en: 'Childhood' },
  praca:       { pl: 'Praca',        de: 'Arbeit',        en: 'Work' },
  sens:        { pl: 'Sens',         de: 'Sinn',          en: 'Meaning' },
  strata:      { pl: 'Strata',       de: 'Verlust',       en: 'Loss' },
};

export function isValidFragmentTag(tag: unknown): tag is FragmentTag {
  return typeof tag === 'string' && (FRAGMENT_TAGS as readonly string[]).includes(tag);
}

export function tagLabel(tag: string, locale: 'pl' | 'de' | 'en' = 'pl'): string {
  return isValidFragmentTag(tag) ? FRAGMENT_TAG_LABELS[tag][locale] : tag;
}
