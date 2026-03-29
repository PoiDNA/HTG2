import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { Presentation } from 'lucide-react';
import AdminSessionList from './AdminSessionList';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) redirect(`/${locale}/konto`);

  const db = createSupabaseServiceRole();

  const SESSION_TYPES = ['natalia_solo', 'natalia_asysta', 'natalia_justyna', 'natalia_agata', 'natalia_para'];

  const { data: bookings } = await db
    .from('bookings')
    .select(`
      id, session_type, status, topics, live_session_id, created_at, payment_status,
      slot:booking_slots(slot_date, start_time, end_time),
      user_id
    `)
    .in('session_type', SESSION_TYPES)
    .in('status', ['confirmed', 'completed', 'pending_confirmation'])
    .order('created_at', { ascending: false })
    .limit(2000);

  // Enrich with client profiles
  const userIds = [...new Set((bookings || []).map((b: any) => b.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0
    ? await db.from('profiles').select('id, email, display_name').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const enriched = (bookings || []).map((b: any) => ({
    ...b,
    client: profileMap.get(b.user_id) || null,
  }));

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Presentation className="w-6 h-6 text-htg-indigo" />
        <div>
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Sesje klientów</h2>
          <p className="text-sm text-htg-fg-muted">Wszystkie sesje indywidualne — {enriched.length} łącznie</p>
        </div>
      </div>

      <AdminSessionList
        bookings={enriched}
        todayStr={todayStr}
        locale={locale}
      />
    </div>
  );
}
