export const ADMIN_EMAILS = ['htg@htg.cyou'];
export const STAFF_EMAILS = ['natalia@htg.cyou', 'agata@htg.cyou', 'justyna@htg.cyou', 'przemek@htg.cyou'];

export type UserRole = 'user' | 'moderator' | 'admin';

/**
 * Determine the expected profile role based on email.
 * Returns null if no special role is associated.
 */
export function getRoleForEmail(email: string): UserRole | null {
  const lower = email.toLowerCase();
  if (ADMIN_EMAILS.includes(lower)) return 'admin';
  if (STAFF_EMAILS.includes(lower)) return 'moderator';
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
