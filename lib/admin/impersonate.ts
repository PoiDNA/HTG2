'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';

export const IMPERSONATE_COOKIE = 'admin_view_as';

export async function startImpersonation(formData: FormData) {
  const staffId = formData.get('staffId') as string;
  const locale  = (formData.get('locale') as string) || 'pl';

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) throw new Error('Brak uprawnień');

  (await cookies()).set(IMPERSONATE_COOKIE, staffId, {
    httpOnly: true,
    path: '/',
    maxAge: 7200,          // 2 h
    sameSite: 'lax',
  });

  redirect(`/${locale}/prowadzacy`);
}

export async function stopImpersonation(formData: FormData) {
  const locale = (formData.get('locale') as string) || 'pl';
  (await cookies()).delete(IMPERSONATE_COOKIE);
  redirect(`/${locale}/konto/admin/podglad`);
}
