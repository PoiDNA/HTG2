import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ALL_SESSION_TYPES } from '@/lib/booking/constants';
import type { Booking, AccelerationEntry } from '@/lib/booking/types';
import BookingCalendar from '@/components/booking/BookingCalendar';
import BookingCard from '@/components/booking/BookingCard';
import AccelerationRequest from '@/components/booking/AccelerationRequest';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function IndividualSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Booking' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch user's bookings with slot details
  let bookings: Booking[] = [];
  if (user) {
    const { data } = await supabase
      .from('bookings')
      .select(`
        *,
        slot:booking_slots(*)
      `)
      .eq('user_id', user.id)
      .in('status', ['pending_confirmation', 'confirmed', 'completed'])
      .order('assigned_at', { ascending: false })
      .limit(20);

    // Sort by slot date/time — nearest session first
    bookings = ((data ?? []) as Booking[]).sort((a, b) => {
      const dateA = a.slot ? a.slot.slot_date + 'T' + a.slot.start_time : '9999';
      const dateB = b.slot ? b.slot.slot_date + 'T' + b.slot.start_time : '9999';
      return dateA.localeCompare(dateB);
    });
  }

  // Fetch user's unbooked individual session entitlements
  let unbookedCount = 0;
  if (user) {
    const { count } = await supabase
      .from('entitlements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('type', 'individual')
      .eq('is_active', true)
      .is('booking_id', null)
      .gte('valid_until', new Date().toISOString());

    unbookedCount = count ?? 0;
  }

  // Fetch user's acceleration queue entries
  let accelerationEntries: AccelerationEntry[] = [];
  if (user) {
    const { data } = await supabase
      .from('acceleration_queue')
      .select(`
        *,
        offered_slot:booking_slots(*)
      `)
      .eq('user_id', user.id)
      .in('status', ['waiting', 'offered'])
      .order('created_at', { ascending: false });

    accelerationEntries = (data ?? []) as AccelerationEntry[];
  }

  const activeBookings = bookings.filter(
    (b) => b.status === 'pending_confirmation' || b.status === 'confirmed'
  );
  const pastBookings = bookings.filter(
    (b) => b.status === 'completed'
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-serif font-semibold text-htg-fg mb-1">{t('title')}</h2>
        <p className="text-sm text-htg-fg-muted">{t('subtitle')}</p>
      </div>

      {/* Unbooked entitlements notice */}
      {unbookedCount > 0 && (
        <div className="bg-htg-sage/5 border border-htg-sage/20 rounded-xl p-4">
          <h3 className="font-semibold text-htg-fg text-sm mb-1">{t('unbooked_title')}</h3>
          <p className="text-sm text-htg-fg-muted">
            {t('unbooked_desc', { count: unbookedCount })}
          </p>
        </div>
      )}

      {/* Active bookings */}
      {activeBookings.length > 0 && (
        <div>
          <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4">{t('your_bookings')}</h3>
          <div className="grid grid-cols-1 gap-4">
            {activeBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                locale={locale}
                hasEarlierSlots={booking.status === 'confirmed'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Acceleration queue */}
      {accelerationEntries.length > 0 && (
        <div>
          <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4">{t('acceleration_title')}</h3>
          <div className="space-y-3">
            {accelerationEntries.map((entry) => (
              <AccelerationRequest
                key={entry.id}
                sessionType={entry.session_type}
                bookingId={entry.booking_id ?? undefined}
                existingEntry={entry}
                locale={locale}
              />
            ))}
          </div>
        </div>
      )}

      {/* Calendar for booking new slots */}
      <div id="booking-calendar">
        <h3 className="text-lg font-serif font-semibold text-htg-fg mb-2">Wybierz termin</h3>
        <p className="text-xs text-htg-warm mb-4">
          ⚠ Zmiana terminu poniżej 48h przed sesją uzależniona jest od przejęcia terminu przez inną osobę. Wolny termin jest ogłaszany w panelach osób oczekujących.
        </p>
        <BookingCalendar sessionTypes={ALL_SESSION_TYPES} locale={locale} />
      </div>

      {/* Acceleration request for users without one */}
      {activeBookings.length > 0 && accelerationEntries.length === 0 && (
        <div>
          <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4">{t('acceleration_title')}</h3>
          <AccelerationRequest
            sessionType={activeBookings[0].session_type}
            bookingId={activeBookings[0].id}
            locale={locale}
          />
        </div>
      )}

      {/* Past bookings */}
      {pastBookings.length > 0 && (
        <div>
          <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4 text-htg-fg-muted">
            {t('status_completed')}
          </h3>
          <div className="grid grid-cols-1 gap-3 opacity-60">
            {pastBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} locale={locale} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {bookings.length === 0 && unbookedCount === 0 && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <p className="text-htg-fg-muted">{t('no_bookings')}</p>
        </div>
      )}
    </div>
  );
}
