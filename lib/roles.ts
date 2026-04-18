import { STAFF } from '@/lib/staff-config';

// ─── Derived email lists (source of truth: lib/staff-config.ts) ─────────────

export const ADMIN_EMAILS = STAFF
  .filter(s => s.role === 'admin')
  .map(s => s.email);

/** Staff with session-management access (practitioner + operators) */
export const STAFF_EMAILS = STAFF
  .filter(s => s.role === 'practitioner' || s.role === 'operator')
  .map(s => s.email);

export const EDITOR_EMAILS = STAFF
  .filter(s => s.role === 'editor')
  .map(s => s.email);

export const TRANSLATOR_EMAILS = STAFF
  .filter(s => s.role === 'translator')
  .map(s => s.email);

/** Translator email → assigned locale */
export const TRANSLATOR_LOCALE: Record<string, string> = Object.fromEntries(
  STAFF
    .filter(s => s.role === 'translator' && s.locale)
    .map(s => [s.email, s.locale!]),
);

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'moderator' | 'admin' | 'publikacja' | 'translator';

// ─── Role resolution ─────────────────────────────────────────────────────────

/**
 * Determine the expected profile role based on email.
 * Returns null if no special role is associated.
 */
export function getRoleForEmail(email: string): UserRole | null {
  const lower = email.toLowerCase();
  if (ADMIN_EMAILS.includes(lower)) return 'admin';
  if (STAFF_EMAILS.includes(lower)) return 'moderator';
  if (EDITOR_EMAILS.includes(lower)) return 'publikacja';
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
 * Other staff members (operatorki, edytorki) are deliberately NOT included
 * — RODO data minimization principle.
 *
 * If you need to add another viewer in the future, append their email here.
 * Every read of `session_client_insights` is audited via
 * lib/audit/insights-audit.ts so changes to this allowlist are observable.
 */
export const CLIENT_RECORDINGS_VIEWERS = ['htg@htg.cyou', 'natalia@htg.cyou'];

export function canViewClientRecordings(email: string): boolean {
  return CLIENT_RECORDINGS_VIEWERS.includes(email.toLowerCase());
}

// ─── "Po sesji" access ───────────────────────────────────────────────
// Dynamiczna rola: user ma dostęp do Pytań do sesji badawczych jeśli ma
// wpisany termin sesji (booking confirmed/completed) LUB był uczestnikiem
// grupowej sesji htg_meeting_sessions. Archiwalne nagrania nie są wymagane.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function hasPoSesjiAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_po_sesji_access', { uid: userId });
  if (error) return false;
  return data === true;
}
