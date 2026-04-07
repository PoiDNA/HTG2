'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { DESIGN_VARIANT_COOKIE, type DesignVariant } from './design-variant';

const VALID: ReadonlySet<string> = new Set<DesignVariant>(['v1', 'v2', 'v3']);

export async function setDesignVariant(formData: FormData) {
  // Authorize: check email-based admin (same as impersonate pattern)
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) {
    throw new Error('Brak uprawnień');
  }

  const variant = formData.get('variant') as string;
  if (!VALID.has(variant)) throw new Error('Nieprawidłowy wariant');

  const locale = (formData.get('locale') as string) || 'pl';
  const path = (formData.get('path') as string) || `/${locale}/konto`;

  (await cookies()).set(DESIGN_VARIANT_COOKIE, variant, {
    httpOnly: true,
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 90, // 90 days
    sameSite: 'lax',
  });

  redirect(path);
}
