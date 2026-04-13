import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import SesjaConfirmButton from './SesjaConfirmButton';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

interface Slot {
  slot_date: string;
  start_time: string;
  end_time: string;
}

interface BookingRow {
  id: string;
  session_type: SessionType;
  status: string;
  live_session_id: string | null;
  session_date: string | null;
  start_time: string | null;
  slot: Slot | null;
  isOwner: boolean;
}

function getSessionDateTime(b: BookingRow): Date | null {
  if (b.slot?.slot_date) {
    return new Date(b.slot.slot_date + 'T' + b.slot.start_time + '+02:00');
  }
  if (b.session_date) {
    return new Date(b.session_date + 'T' + (b.start_time || '09:00') + '+02:00');
  }
  return null;
}

function getHoursUntil(dt: Date): number {
  return (dt.getTime() - Date.now()) / (1000 * 60 * 60);
}

function formatDateTime(dt: Date, locale: string): string {
  return dt.toLocaleDateString(locale === 'en' ? 'en-GB' : 'pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  });
}

export default async function SesjaPanelPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Booking' });

  const { userId, supabase, isImpersonating } = await getEffectiveUser();

  // Owner bookings (status filter in DB — only active)
  const { data: ownerData } = await supabase
    .from('bookings')
    .select('id, session_type, status, live_session_id, session_date, start_time, slot:booking_slots(slot_date, start_time, end_time)')
    .eq('user_id', userId)
    .in('status', ['pending_confirmation', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(200);

  const ownerBookings: BookingRow[] = (ownerData ?? []).map((b: any) => ({
    ...b,
    slot: b.slot ?? null,
    isOwner: true,
  }));

  // Companion bookings (via service role for cross-user access)
  const db2 = createSupabaseServiceRole();
  const { data: companionRows } = await db2
    .from('booking_companions')
    .select(`
      accepted_at,
      bookings!inner (
        id, session_type, status, live_session_id,
        session_date, start_time,
        booking_slots (slot_date, start_time, end_time)
      )
    `)
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .order('invited_at', { ascending: false })
    .limit(200);

  const companionBookings: BookingRow[] = (companionRows ?? [])
    .map((c: any) => ({
      ...c.bookings,
      slot: c.bookings?.booking_slots ?? null,
      isOwner: false,
    }))
    .filter((b: BookingRow) => ['pending_confirmation', 'confirmed'].includes(b.status));

  // Merge + dedup (owner priority)
  const bookingMap = new Map<string, BookingRow>();
  for (const b of ownerBookings) bookingMap.set(b.id, b);
  for (const b of companionBookings) {
    if (!bookingMap.has(b.id)) bookingMap.set(b.id, b);
  }

  // Filter: upcoming + currently running (dt >= now - 3h)
  // For null date: keep only pending_confirmation (probably new)
  const now = Date.now();
  const threeHoursMs = 3 * 60 * 60 * 1000;
  const allBookings = [...bookingMap.values()].filter(b => {
    const dt = getSessionDateTime(b);
    if (dt) return dt.getTime() >= now - threeHoursMs;
    return b.status === 'pending_confirmation';
  });

  // Sort: nearest-first, null dates at end, secondary by id for stability
  allBookings.sort((a, b) => {
    const dtA = getSessionDateTime(a);
    const dtB = getSessionDateTime(b);
    if (dtA && dtB) return dtA.getTime() - dtB.getTime();
    if (dtA && !dtB) return -1;
    if (!dtA && dtB) return 1;
    return a.id.localeCompare(b.id);
  });

  if (allBookings.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-htg-fg-muted text-lg">{t('no_bookings')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allBookings.map(b => {
        const dt = getSessionDateTime(b);
        const hoursUntil = dt ? getHoursUntil(dt) : null;
        const config = SESSION_CONFIG[b.session_type];
        const isConfirmed = b.status === 'confirmed';
        const isPending = b.status === 'pending_confirmation';
        const canJoin = isConfirmed && hoursUntil !== null && hoursUntil <= 0.5 && hoursUntil > -3 && b.live_session_id;
        const showWaiting = isConfirmed && hoursUntil !== null && hoursUntil > 0.5 && hoursUntil <= 24;

        return (
          <div
            key={b.id}
            className="bg-htg-card border border-htg-card-border rounded-xl p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-serif font-bold text-htg-fg">
                  {config?.labelShort ?? b.session_type}
                </h3>
                {dt && (
                  <p className="text-sm text-htg-fg-muted mt-1">
                    {formatDateTime(dt, locale)}
                  </p>
                )}
                {!dt && (
                  <p className="text-sm text-htg-fg-muted mt-1">
                    {t('date_tbd')}
                  </p>
                )}
              </div>
              {!b.isOwner && (
                <span className="text-xs bg-htg-surface text-htg-fg-muted px-2 py-1 rounded">
                  {t('partner_session')}
                </span>
              )}
            </div>

            {/* CTA section */}
            <div className="flex flex-wrap gap-2">
              {canJoin && (
                <a
                  href={`/live/${b.live_session_id}`}
                  className="bg-htg-warm text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-htg-warm/90 transition-colors animate-pulse"
                >
                  {t('join_session')}
                </a>
              )}

              {showWaiting && (
                <span className="text-xs text-htg-fg-muted bg-htg-surface px-3 py-2 rounded-lg">
                  {t('session_today_waiting')}
                </span>
              )}

              {isPending && b.isOwner && !isImpersonating && (
                <SesjaConfirmButton bookingId={b.id} />
              )}

              {isPending && !b.isOwner && (
                <span className="text-xs text-htg-fg-muted bg-htg-surface px-3 py-2 rounded-lg">
                  {t('status_pending')}
                </span>
              )}

              {isPending && b.isOwner && isImpersonating && (
                <span className="text-xs text-htg-fg-muted bg-htg-surface px-3 py-2 rounded-lg">
                  {t('confirm_btn')}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
