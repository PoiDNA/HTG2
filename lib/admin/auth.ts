import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { EDITOR_EMAILS, TRANSLATOR_EMAILS, TRANSLATOR_LOCALE } from '@/lib/roles';

/**
 * Verify that the current request comes from an admin user.
 * Uses session client to authenticate, then returns service-role client
 * (bypasses RLS) for all subsequent data operations.
 */
export async function requireAdmin() {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (!isAdminEmail(user.email ?? '')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { supabase: createSupabaseServiceRole(), user };
}

/**
 * Tak jak requireAdmin, ale dopuszcza również edytorów (rola 'editor'
 * w staff-config). Używane dla narzędzi edycyjnych typu segmentacja
 * Momentów — admin + edytorzy mogą zapisywać fragmenty.
 */
export async function requireAdminOrEditor() {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const email = (user.email ?? '').toLowerCase();
  const allowed = isAdminEmail(email) || EDITOR_EMAILS.includes(email);

  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    supabase: createSupabaseServiceRole(),
    user,
    role: isAdminEmail(email) ? ('admin' as const) : ('editor' as const),
  };
}

/**
 * Jak requireAdminOrEditor, ale dopuszcza również Tłumaczy (rola `translator`
 * w staff-config). Używane dla edytora Momentów i list segmentów — Tłumacz
 * musi widzieć treść po stronie staffa, żeby nanieść korektę w swoim locale.
 *
 * Zwracana `role`:
 *   - 'admin' / 'editor' — mogą wszystko (PL + dowolny locale)
 *   - 'translator' — może edytować WYŁĄCZNIE swój przypisany locale
 *                    (TRANSLATOR_LOCALE[email]); zapisy bez locale / do PL
 *                    muszą być odrzucone po stronie endpointu.
 */
export async function requireAdminOrEditorOrTranslator() {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const email = (user.email ?? '').toLowerCase();
  const isAdmin = isAdminEmail(email);
  const isEditor = EDITOR_EMAILS.includes(email);
  const isTranslator = TRANSLATOR_EMAILS.includes(email);

  if (!isAdmin && !isEditor && !isTranslator) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const role: 'admin' | 'editor' | 'translator' = isAdmin
    ? 'admin'
    : isEditor
      ? 'editor'
      : 'translator';

  return {
    supabase: createSupabaseServiceRole(),
    user,
    role,
    /** Dla rola=translator: przypisany locale (en|de|pt). W przeciwnym wypadku null. */
    translatorLocale: role === 'translator' ? (TRANSLATOR_LOCALE[email] ?? null) : null,
  };
}
