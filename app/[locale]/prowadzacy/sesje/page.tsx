import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Presentation } from 'lucide-react';
import SessionList from './SessionList';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function StaffSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { staffMember } = await getEffectiveStaffMember();
  const admin = createSupabaseServiceRole();

  const isPractitioner = staffMember?.role === 'practitioner';
  const sessionTypes = isPractitioner
    ? ['natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_para', 'natalia_asysta']
    : (staffMember?.session_types || []);

  const { data: bookings } = await admin
    .from('bookings')
    .select(`
      id, session_type, status, topics, live_session_id, created_at, payment_status,
      slot:booking_slots!inner(slot_date, start_time, end_time),
      user_id
    `)
    .in('session_type', sessionTypes)
    .in('status', ['confirmed', 'completed', 'pending_confirmation'])
    .order('created_at', { ascending: false })
    .limit(500);

  const userIds = [...new Set((bookings || []).map((b: any) => b.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0 ? await admin.from('profiles').select('id, email, display_name').in('id', userIds) : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const enrichedBookings = (bookings || []).map((b: any) => ({ ...b, client: profileMap.get(b.user_id) || null }));

  const todayStr = new Date().toISOString().split('T')[0];

  const sortBySlotAsc = (a: any, b: any) => {
    const sa = Array.isArray(a.slot) ? a.slot[0] : a.slot;
    const sb = Array.isArray(b.slot) ? b.slot[0] : b.slot;
    return (sa?.slot_date + sa?.start_time).localeCompare(sb?.slot_date + sb?.start_time);
  };

  const upcoming = enrichedBookings
    .filter((b: any) => {
      const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
      return slot?.slot_date >= todayStr && b.status !== 'completed';
    })
    .sort(sortBySlotAsc);

  const past = enrichedBookings
    .filter((b: any) => {
      const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
      return slot?.slot_date < todayStr || b.status === 'completed';
    })
    .sort((a: any, b: any) => -sortBySlotAsc(a, b));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Presentation className="w-6 h-6 text-htg-indigo" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Moje sesje</h2>
      </div>

      <SessionList
        upcoming={upcoming}
        past={past}
        todayStr={todayStr}
        locale={locale}
      />
    </div>
  );
}
