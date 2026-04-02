import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import type { Booking, AccelerationEntry } from '@/lib/booking/types';
import BookingCard from '@/components/booking/BookingCard';
import ActiveBookingsSection from '@/components/booking/ActiveBookingsSection';
import AccelerationRequest from '@/components/booking/AccelerationRequest';
import { PreSessionUpsell } from '@/components/konto/PreSessionUpsell';
import { CustomPaymentCard } from '@/components/konto/CustomPaymentCard';
import ActiveCallsWidget from '@/components/quick-call/ActiveCallsWidget';
import CompanionInvite from '@/components/booking/CompanionInvite';
import PastBookingAccordion from '@/components/booking/PastBookingAccordion';
import { getSessionCountdown, formatCountdown } from '@/lib/booking/countdown-phrases';

// Session type → assistant slug mapping
const SESSION_TYPE_TO_SLUG: Record<string, string> = {
  natalia_agata: 'agata',
  natalia_justyna: 'justyna',
};

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

  const { userId, supabase } = await getEffectiveUser();

  // Fetch user's bookings with slot details
  const { data } = await supabase
    .from('bookings')
    .select(`
      *,
      slot:booking_slots(*)
    `)
    .eq('user_id', userId)
    .in('status', ['pending_confirmation', 'confirmed', 'completed'])
    .order('assigned_at', { ascending: false })
    .limit(20);

  // Sort: future sessions first (nearest first), then past sessions (most recent first)
  const nowIso = new Date().toISOString();
  const bookings: Booking[] = ((data ?? []) as Booking[]).sort((a, b) => {
    const dateA = a.slot ? a.slot.slot_date + 'T' + a.slot.start_time : '9999';
    const dateB = b.slot ? b.slot.slot_date + 'T' + b.slot.start_time : '9999';
    const aFuture = dateA >= nowIso.slice(0, 16) ? 0 : 1;
    const bFuture = dateB >= nowIso.slice(0, 16) ? 0 : 1;
    if (aFuture !== bFuture) return aFuture - bFuture;
    return aFuture === 0
      ? dateA.localeCompare(dateB)
      : dateB.localeCompare(dateA);
  });

  // Fetch user's unbooked individual session entitlements
  const { count } = await supabase
    .from('entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'individual')
    .eq('is_active', true)
    .is('booking_id', null)
    .gte('valid_until', new Date().toISOString());

  const unbookedCount = count ?? 0;

  // Fetch pre-session upsell data for active bookings with assistant session types
  const preSessionUpsellMap: Record<string, { staffId: string; staffName: string; priceId: string; pricePln: number }> = {};
  {
    // Find active bookings with assistants
    const assistantBookings = bookings.filter(
      b => (b.status === 'pending_confirmation' || b.status === 'confirmed')
        && (b.session_type === 'natalia_agata' || b.session_type === 'natalia_justyna')
    );

    if (assistantBookings.length > 0) {
      const db = createSupabaseServiceRole();
      const assistantSlugs = [...new Set(assistantBookings.map(b => SESSION_TYPE_TO_SLUG[b.session_type]).filter(Boolean))];

      // Fetch paid pre-session settings for these assistants
      const { data: psSettings } = await db
        .from('pre_session_settings')
        .select('staff_member_id, stripe_price_id, price_pln, staff_members!inner(id, name, slug)')
        .eq('is_enabled', true)
        .not('stripe_price_id', 'is', null)
        .not('price_pln', 'is', null);

      // Fetch existing active eligibilities for this user
      const { data: existingElig } = await db
        .from('pre_session_eligibility')
        .select('staff_member_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      const alreadyEligibleIds = new Set((existingElig || []).map((e: any) => e.staff_member_id));

      for (const s of (psSettings || []) as any[]) {
        const staff = s.staff_members;
        if (!assistantSlugs.includes(staff.slug)) continue;
        if (alreadyEligibleIds.has(s.staff_member_id)) continue;
        const sessionType = Object.keys(SESSION_TYPE_TO_SLUG).find(k => SESSION_TYPE_TO_SLUG[k] === staff.slug);
        if (!sessionType) continue;
        preSessionUpsellMap[sessionType] = {
          staffId: s.staff_member_id,
          staffName: staff.name,
          priceId: s.stripe_price_id,
          pricePln: Math.round(s.price_pln / 100),
        };
      }
    }
  }

  // Fetch user's acceleration queue entries
  const { data: accelData } = await supabase
    .from('acceleration_queue')
    .select(`
      *,
      offered_slot:booking_slots(*)
    `)
    .eq('user_id', userId)
    .in('status', ['waiting', 'offered'])
    .order('created_at', { ascending: false });

  const accelerationEntries: AccelerationEntry[] = (accelData ?? []) as AccelerationEntry[];

  // Split bookings: future-active (shown as full cards) vs past (accordion)
  // A booking is "past" if its slot date+time is in the past, regardless of status
  const futureBookings: Booking[] = [];
  const pastAllBookings: Booking[] = [];

  for (const b of bookings) {
    const isActiveStatus = b.status === 'pending_confirmation' || b.status === 'confirmed';
    const isCompleted = b.status === 'completed';
    const slot = b.slot;
    const slotInFuture = slot ? (slot.slot_date + 'T' + slot.start_time) >= nowIso.slice(0, 16) : true;

    if (isActiveStatus && slotInFuture) {
      futureBookings.push(b);
    } else if (isCompleted || (isActiveStatus && !slotInFuture)) {
      // Skip pre_session bookings from past — they are not standalone sessions
      if (b.session_type !== 'pre_session') {
        pastAllBookings.push(b);
      }
    }
  }

  // Keep legacy names for downstream usage
  const activeBookings = futureBookings;

  // Fetch companions for natalia_para bookings
  const paraBookingIds = activeBookings
    .filter(b => b.session_type === 'natalia_para')
    .map(b => b.id);

  const companionMap: Record<string, { email: string; displayName: string | null; acceptedAt: string | null } | null> = {};
  if (paraBookingIds.length > 0) {
    const db = createSupabaseServiceRole();
    const { data: companions } = await db
      .from('booking_companions')
      .select('booking_id, email, display_name, accepted_at')
      .in('booking_id', paraBookingIds);
    (companions ?? []).forEach((c: any) => {
      companionMap[c.booking_id] = { email: c.email, displayName: c.display_name, acceptedAt: c.accepted_at };
    });
  }

  // Fetch partner-joined sessions (user is a companion, not booking owner)
  const db2 = createSupabaseServiceRole();
  const { data: companionRows } = await db2
    .from('booking_companions')
    .select(`
      accepted_at,
      bookings!inner (
        id, session_type, status, live_session_id,
        booking_slots (slot_date, start_time, end_time)
      )
    `)
    .eq('user_id', userId)
    .not('accepted_at', 'is', null);
  const partnerBookings = (companionRows ?? [])
    .map((c: any) => c.bookings)
    .filter((b: any) => ['pending_confirmation', 'confirmed'].includes(b?.status));

  // Countdown: today in Warsaw timezone for calendar-level comparisons
  const todayYmd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  const normalizedLocale: 'pl' | 'en' = locale === 'en' ? 'en' : 'pl';

  // Countdown: hours-until helper (same pattern as BookingCard for consistency)
  function getHoursUntil(slot: { slot_date: string; start_time: string }): number {
    const dt = new Date(slot.slot_date + 'T' + slot.start_time + '+02:00');
    return (dt.getTime() - Date.now()) / (1000 * 60 * 60);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-serif font-semibold text-htg-fg mb-1">{t('title')}</h2>
        <p className="text-sm text-htg-fg-muted">{t('subtitle')}</p>
      </div>

      {/* Active calls — shown when staff initiates a call */}
      <ActiveCallsWidget locale={locale} />

      {/* Unbooked entitlements notice */}
      {unbookedCount > 0 && (
        <div className="bg-htg-sage/5 border border-htg-sage/20 rounded-xl p-4">
          <h3 className="font-semibold text-htg-fg text-sm mb-1">{t('unbooked_title')}</h3>
          <p className="text-sm text-htg-fg-muted">
            {t('unbooked_desc', { count: unbookedCount })}
          </p>
        </div>
      )}

      {/* Active bookings with inline reschedule calendar */}
      {activeBookings.length > 0 && (
        <ActiveBookingsSection locale={locale}>
          <div className="grid grid-cols-1 gap-4">
            {activeBookings.map((booking) => {
              const upsell = preSessionUpsellMap[booking.session_type];
              const slot = booking.slot;
              const showCountdown = booking.status === 'confirmed'
                && slot
                && getHoursUntil(slot) > 24;
              const countdown = showCountdown
                ? getSessionCountdown(booking.id, slot.slot_date, todayYmd)
                : null;

              return (
                <div key={booking.id}>
                  <BookingCard
                    booking={booking}
                    locale={locale}
                    hasEarlierSlots={booking.status === 'confirmed'}
                    countdownPhrase={countdown ? t(countdown.phraseKey) : null}
                    countdownText={countdown ? formatCountdown(countdown.months, countdown.days, normalizedLocale) : null}
                  />
                  {upsell && (
                    <PreSessionUpsell
                      staffId={upsell.staffId}
                      staffName={upsell.staffName}
                      priceId={upsell.priceId}
                      pricePln={upsell.pricePln}
                      sourceBookingId={booking.id}
                      locale={locale}
                    />
                  )}
                  {booking.payment_status === 'installments' && (
                    <CustomPaymentCard
                      sessionType={booking.session_type}
                      slotId={booking.slot?.id}
                      locale={locale}
                    />
                  )}
                  {booking.session_type === 'natalia_para' && (
                    <CompanionInvite
                      bookingId={booking.id}
                      existingCompanion={companionMap[booking.id] ?? null}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </ActiveBookingsSection>
      )}

      {/* Sessions where user is a partner (companion) */}
      {partnerBookings.length > 0 && (
        <div>
          <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4 flex items-center gap-2">
            <span>💑</span> Sesje partnerskie
          </h3>
          <div className="space-y-3">
            {partnerBookings.map((b: any) => {
              const slot = b.booking_slots;
              const date = slot
                ? new Date(slot.slot_date + 'T' + slot.start_time).toLocaleString('pl-PL', {
                    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : 'Termin nieznany';
              return (
                <div key={b.id} className="bg-htg-card border border-rose-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-htg-fg text-sm">Sesja dla par — Natalia</p>
                    <p className="text-xs text-htg-fg-muted mt-0.5 capitalize">{date}</p>
                  </div>
                  {b.live_session_id && (
                    <a
                      href={`/${locale}/live/${b.live_session_id}`}
                      className="px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 transition-colors"
                    >
                      Dołącz
                    </a>
                  )}
                </div>
              );
            })}
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

      {/* Past bookings — accordion */}
      {pastAllBookings.length > 0 && (
        <div>
          <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4 text-htg-fg-muted">
            {t('past_sessions_title')}
          </h3>
          <PastBookingAccordion bookings={pastAllBookings} locale={locale} />
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
