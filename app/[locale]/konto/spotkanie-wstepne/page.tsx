import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { redirect } from 'next/navigation';
import { PreSessionBooking } from '@/components/konto/PreSessionBooking';
import { CheckCircle, Video } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SpotkaniePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId } = await getEffectiveUser();

  const db = createSupabaseServiceRole();

  // Find all active eligibilities for this client
  const { data: eligibilities } = await db
    .from('pre_session_eligibility')
    .select('id, staff_member_id, is_active, meeting_booked, pre_booking_id, created_at')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!eligibilities || eligibilities.length === 0) {
    redirect(`/${locale}/konto`);
  }

  // Fetch assistant details + their settings
  const staffIds = [...new Set(eligibilities.map((e: any) => e.staff_member_id))];
  const { data: staffMembers } = await db
    .from('staff_members')
    .select('id, name, slug, email')
    .in('id', staffIds);

  const { data: settingsList } = await db
    .from('pre_session_settings')
    .select('staff_member_id, is_enabled, note_for_client')
    .in('staff_member_id', staffIds)
    .eq('is_enabled', true);

  const settingsMap = new Map((settingsList || []).map((s: any) => [s.staff_member_id, s]));
  const staffMap = new Map((staffMembers || []).map((s: any) => [s.id, s]));

  // Only show eligibilities where assistant has feature enabled
  const activeEligibilities = eligibilities.filter((e: any) => settingsMap.has(e.staff_member_id));

  if (activeEligibilities.length === 0) {
    redirect(`/${locale}/konto`);
  }

  // Fetch available slots per assistant
  const slotsPerAssistant: Record<string, any[]> = {};
  const today = new Date().toISOString().split('T')[0];

  for (const staffId of staffIds) {
    if (!settingsMap.has(staffId)) continue;
    const { data: slots } = await db
      .from('booking_slots')
      .select('id, slot_date, start_time, end_time')
      .eq('session_type', 'pre_session')
      .eq('assistant_id', staffId)
      .eq('status', 'available')
      .gte('slot_date', today)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(30);
    slotsPerAssistant[staffId] = slots || [];
  }

  // Fetch booked meeting details if already booked
  const bookedIds = activeEligibilities
    .filter((e: any) => e.meeting_booked && e.pre_booking_id)
    .map((e: any) => e.pre_booking_id);

  const { data: bookedBookings } = bookedIds.length > 0
    ? await db
        .from('bookings')
        .select('id, slot_id, slot:booking_slots(slot_date, start_time, end_time, assistant_id)')
        .in('id', bookedIds)
    : { data: [] };

  const bookedMap = new Map((bookedBookings || []).map((b: any) => [b.id, b]));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Video className="w-6 h-6 text-purple-400" />
        <div>
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Spotkanie wstępne</h2>
          <p className="text-sm text-htg-fg-muted">
            Krótkie 15-minutowe spotkanie online z asystentką przed Twoją sesją
          </p>
        </div>
      </div>

      {activeEligibilities.map((eligibility: any) => {
        const staff = staffMap.get(eligibility.staff_member_id);
        const settings = settingsMap.get(eligibility.staff_member_id);
        const slots = slotsPerAssistant[eligibility.staff_member_id] || [];
        const bookedBooking = eligibility.meeting_booked && eligibility.pre_booking_id
          ? bookedMap.get(eligibility.pre_booking_id)
          : null;

        if (!staff) return null;

        if (eligibility.meeting_booked && bookedBooking) {
          const slot = Array.isArray(bookedBooking.slot) ? bookedBooking.slot[0] : bookedBooking.slot;
          return (
            <div key={eligibility.id} className="bg-htg-card border border-htg-card-border rounded-xl p-6">
              <div className="flex items-start gap-4">
                <CheckCircle className="w-8 h-8 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-htg-fg text-lg">
                    Spotkanie z {staff.name} — zarezerwowane ✓
                  </h3>
                  {slot && (
                    <p className="text-htg-fg-muted mt-1">
                      {new Date(slot.slot_date).toLocaleDateString('pl-PL', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      })}{' '}
                      o {slot.start_time?.slice(0, 5)}–{slot.end_time?.slice(0, 5)}
                    </p>
                  )}
                  <p className="text-sm text-htg-fg-muted mt-2">
                    Link do spotkania pojawi się na tej stronie przed terminem.
                    Spotkania nie można przełożyć — w razie pytań skontaktuj się bezpośrednio.
                  </p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <PreSessionBooking
            key={eligibility.id}
            eligibilityId={eligibility.id}
            staffMember={staff}
            settings={settings}
            slots={slots}
            locale={locale}
          />
        );
      })}
    </div>
  );
}
