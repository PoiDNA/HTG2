import { setRequestLocale } from 'next-intl/server';
import { locales, redirect } from '@/i18n-config';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { PreSessionManager } from '@/components/prowadzacy/PreSessionManager';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SpotkaniaPrzedSesjaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { staffMember, user } = await getEffectiveStaffMember();

  if (!staffMember || staffMember.role !== 'operator') {
    return redirect({href: '/prowadzacy', locale});
  }

  const db = createSupabaseServiceRole();

  // Fetch current settings
  const { data: settings } = await db
    .from('pre_session_settings')
    .select('*')
    .eq('staff_member_id', staffMember.id)
    .maybeSingle();

  // Fetch eligible clients with their profiles
  const { data: eligibilityRaw } = await db
    .from('pre_session_eligibility')
    .select('id, user_id, source_booking_id, is_active, meeting_booked, pre_booking_id, created_at')
    .eq('staff_member_id', staffMember.id)
    .order('created_at', { ascending: false });

  const eligibility = eligibilityRaw || [];
  const userIds = [...new Set(eligibility.map((e: any) => e.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await db.from('profiles').select('id, email, display_name').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const enrichedEligibility = eligibility.map((e: any) => ({
    ...e,
    user: profileMap.get(e.user_id) || null,
  }));

  // Fetch upcoming pre-session slots for this assistant
  const today = new Date().toISOString().split('T')[0];
  const { data: slots } = await db
    .from('booking_slots')
    .select('id, slot_date, start_time, end_time, status, notes')
    .eq('session_type', 'pre_session')
    .eq('assistant_id', staffMember.id)
    .gte('slot_date', today)
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(60);

  // Fetch bookings for booked slots to show client names
  const bookedSlotIds = (slots || []).filter((s: any) => s.status === 'booked').map((s: any) => s.id);
  const { data: bookings } = bookedSlotIds.length > 0
    ? await db
        .from('bookings')
        .select('slot_id, user_id')
        .in('slot_id', bookedSlotIds)
        .eq('session_type', 'pre_session')
    : { data: [] };
  const bookingMap = new Map((bookings || []).map((b: any) => [b.slot_id, b.user_id]));

  const slotsWithClient = (slots || []).map((s: any) => ({
    ...s,
    client: s.status === 'booked'
      ? (profileMap.get(bookingMap.get(s.id)) || null)
      : null,
  }));

  return (
    <PreSessionManager
      staffMember={staffMember}
      settings={settings}
      eligibility={enrichedEligibility}
      slots={slotsWithClient}
      locale={locale}
    />
  );
}
