import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canEditSesje, canDeleteSesje } from '@/lib/staff-config';
import SesjePanelClient, { type SesjaRow } from './SesjePanelClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = 'force-dynamic';

export default async function SesjePanelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sb = await createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/${locale}/login?returnTo=/konto/sesje-panel`);
  if (!canEditSesje(user.email)) {
    redirect(`/${locale}/login?error=forbidden`);
  }

  const isAdmin = canDeleteSesje(user.email);

  const db = createSupabaseServiceRole();
  const { data: bookings } = await db
    .from('bookings')
    .select(`
      id, user_id, session_type, status,
      session_date, start_time, topics, payment_notes,
      created_at, slot_id,
      slot:booking_slots(slot_date, start_time),
      profile:profiles!bookings_user_id_fkey(display_name, email, phone)
    `)
    .order('created_at', { ascending: false })
    .limit(500);

  const rows: SesjaRow[] = (bookings ?? []).map((b: any) => ({
    id: b.id,
    user_id: b.user_id,
    session_type: b.session_type,
    status: b.status,
    session_date: b.slot?.slot_date ?? b.session_date ?? null,
    start_time: b.slot?.start_time ?? b.start_time ?? null,
    topics: b.topics ?? null,
    payment_notes: b.payment_notes ?? null,
    has_slot: !!b.slot_id,
    display_name: b.profile?.display_name ?? null,
    email: b.profile?.email ?? null,
    phone: b.profile?.phone ?? null,
    created_at: b.created_at,
  }));

  return (
    <SesjePanelClient
      rows={rows}
      isAdmin={isAdmin}
      currentUserEmail={user.email ?? ''}
    />
  );
}
