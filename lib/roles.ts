export const ADMIN_EMAILS = ['htg@htg.cyou'];
export const STAFF_EMAILS = ['natalia@htg.cyou', 'agata@htg.cyou', 'justyna@htg.cyou', 'przemek@htg.cyou'];
export const TRANSLATOR_EMAILS = ['melania@htg.cyou', 'bernadetta@htg.cyou', 'edytap@htg.cyou', 'milena@htg.cyou'];

export type UserRole = 'user' | 'moderator' | 'admin' | 'publikacja' | 'translator';

/** Translator email → assigned locale */
export const TRANSLATOR_LOCALE: Record<string, string> = {
  'melania@htg.cyou': 'en',
  'bernadetta@htg.cyou': 'de',
  'edytap@htg.cyou': 'pt',
};

/**
 * Determine the expected profile role based on email.
 * Returns null if no special role is associated.
 */
export function getRoleForEmail(email: string): UserRole | null {
  const lower = email.toLowerCase();
  if (ADMIN_EMAILS.includes(lower)) return 'admin';
  if (STAFF_EMAILS.includes(lower)) return 'moderator';
  if (TRANSLATOR_EMAILS.includes(lower)) return 'translator';
  return null;
}

/**
 * Check if the user has staff-level access (moderator or admin).
 */
export function isStaffEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return STAFF_EMAILS.includes(lower) || ADMIN_EMAILS.includes(lower);
}

/**
 * Check if the user has admin-level access.
 */
export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Check if the user is a translator.
 */
export function isTranslatorEmail(email: string): boolean {
  return TRANSLATOR_EMAILS.includes(email.toLowerCase());
}

/**
 * Allowlist for the admin client-recordings panel and the related transcript
 * viewer / PDF export endpoints. Admin always has access; Natalia (the lead
 * practitioner) is the only staff member added here because she needs to read
 * client transcripts and AI-extracted insights to provide therapy support.
 *
 * Other staff members (Agata, Justyna, Przemek) are deliberately NOT included
 * — they are practitioners who run their own sessions but do not need
 * cross-client access to transcripts (RODO data minimization principle).
 *
 * If you need to add another viewer in the future, append their email here.
 * Every read of `session_client_insights` is audited via
 * lib/audit/insights-audit.ts so changes to this allowlist are observable.
 */
export const CLIENT_RECORDINGS_VIEWERS = ['htg@htg.cyou', 'natalia@htg.cyou'];

export function canViewClientRecordings(email: string): boolean {
  return CLIENT_RECORDINGS_VIEWERS.includes(email.toLowerCase());
}
