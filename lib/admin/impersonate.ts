'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { IMPERSONATE_COOKIE, IMPERSONATE_USER_COOKIE } from './impersonate-const';

export async function startImpersonation(formData: FormData) {
  const staffId = formData.get('staffId') as string;
  const locale  = (formData.get('locale') as string) || 'pl';

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) throw new Error('Brak uprawnień');

  (await cookies()).set(IMPERSONATE_COOKIE, staffId, {
    httpOnly: true,
    secure: true,
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

export async function startUserImpersonation(formData: FormData) {
  const email = formData.get('email') as string;
  const locale = (formData.get('locale') as string) || 'pl';
  const redirectTo = (formData.get('redirectTo') as string) || '/konto';

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) throw new Error('Brak uprawnień');

  const db = createSupabaseServiceRole();
  const { data: profile } = await db
    .from('profiles')
    .select('id, email')
    .eq('email', email.trim().toLowerCase())
    .single();

  if (!profile) throw new Error(`Nie znaleziono użytkownika: ${email}`);

  (await cookies()).set(IMPERSONATE_USER_COOKIE, profile.id, {
    httpOnly: true,
    secure: true,
    path: '/',
    maxAge: 7200,
    sameSite: 'lax',
  });

  // Safety: only allow internal paths
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/konto';
  redirect(`/${locale}${safeRedirect}`);
}

export async function stopUserImpersonation(formData: FormData) {
  const locale = (formData.get('locale') as string) || 'pl';
  (await cookies()).delete(IMPERSONATE_USER_COOKIE);
  redirect(`/${locale}/konto/admin`);
}
