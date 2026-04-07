import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Calendar, Clock, Users, Mic, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n-config';
import StripeConnectCard from '@/components/staff/StripeConnectCard';
import InitiateCallModal from '@/components/quick-call/InitiateCallModal';
import ActiveCallsWidget from '@/components/quick-call/ActiveCallsWidget';
import PaymentStatusBadge from '@/components/staff/PaymentStatusBadge';
import CreateRoomButton from '@/components/staff/CreateRoomButton';
import { PAYMENT_STATUS_LABELS } from '@/lib/booking/constants';

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid:       { label: PAYMENT_STATUS_LABELS.confirmed_paid,       className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  installments:         { label: PAYMENT_STATUS_LABELS.installments,         className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  partial_payment:      { label: PAYMENT_STATUS_LABELS.partial_payment,      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  pending_verification: { label: PAYMENT_STATUS_LABELS.pending_verification, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

const SESSION_TYPE_BADGE: Record<string, { className: string }> = {
  natalia_solo: { className: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/30' },
  natalia_agata: { className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  natalia_justyna: { className: 'bg-rose-900/40 text-rose-300 border border-rose-700/30' },
  natalia_para: { className: 'bg-pink-900/40 text-pink-300 border border-pink-700/30' },
  natalia_asysta: { className: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
};

export default async function StaffDashboard({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Staff' });

  const { staffMember } = await getEffectiveStaffMember();
  const admin = createSupabaseServiceRole();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const sessionTypes = staffMember?.session_types || [];
  const isPractitioner = staffMember?.role === 'practitioner';

  // Fetch upcoming confirmed bookings with live session info
  let upcomingBookings: any[] = [];
  let todaySessions: any[] = [];
  let sessionsThisWeek = 0;

  if (staffMember && sessionTypes.length > 0) {
    // All bookings — no FK join on profiles (FK goes to auth.users, not profiles)
    const { data: rawBookings } = await admin
      .from('bookings')
      .select(`
        id, session_type, status, topics, live_session_id, user_id, payment_status,
        slot:booking_slots!inner(slot_date, start_time, end_time)
      `)
      .in('session_type', isPractitioner ? ['natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_para', 'natalia_asysta'] : sessionTypes)
      .in('status', ['confirmed', 'pending_confirmation'])
      .gte('slot.slot_date', todayStr)
      .order('slot_date', { referencedTable: 'booking_slots', ascending: true })
      .limit(500);

    // Fetch client profiles separately
    const userIds = [...new Set((rawBookings || []).map((b: any) => b.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length > 0
      ? await admin.from('profiles').select('id, email, display_name').in('id', userIds)
      : { data: [] };
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const bookings = (rawBookings || []).map((b: any) => ({
      ...b,
      client: profileMap.get(b.user_id) || null,
    }));

    // Filter to today+ and sort by date
    upcomingBookings = (bookings || [])
      .filter((b: any) => {
        const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
        return slot?.slot_date >= todayStr;
      })
      .sort((a: any, b: any) => {
        const sa = Array.isArray(a.slot) ? a.slot[0] : a.slot;
        const sb = Array.isArray(b.slot) ? b.slot[0] : b.slot;
        const da = (sa?.slot_date || '') + 'T' + (sa?.start_time || '');
        const db = (sb?.slot_date || '') + 'T' + (sb?.start_time || '');
        return da.localeCompare(db);
      });

    // Today's sessions
    todaySessions = upcomingBookings.filter((b: any) => {
      const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
      return slot?.slot_date === todayStr;
    });

    // Count this week
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    sessionsThisWeek = upcomingBookings.filter((b: any) => {
      const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
      return slot?.slot_date && slot.slot_date <= weekEnd.toISOString().split('T')[0];
    }).length;
  }

  function getSlot(booking: any) {
    return Array.isArray(booking.slot) ? booking.slot[0] : booking.slot;
  }
  function getClient(booking: any) {
    return Array.isArray(booking.client) ? booking.client[0] : booking.client;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-htg-fg">
            {staffMember ? `Witaj, ${staffMember.name}` : 'Panel prowadzącego'}
          </h1>
          <p className="text-htg-fg-muted text-sm mt-1">
            {staffMember?.role === 'practitioner' ? 'Prowadząca' : 'Asystentka'} · {todayStr}
          </p>
        </div>
        <InitiateCallModal locale={locale} />
      </div>

      {/* Active calls widget */}
      <ActiveCallsWidget locale={locale} />

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-htg-sage" />
            <span className="text-sm text-htg-fg-muted">Dziś</span>
          </div>
          <p className="text-2xl font-serif font-bold text-htg-fg">{todaySessions.length}</p>
          <p className="text-xs text-htg-fg-muted">sesji na dziś</p>
        </div>

        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-htg-indigo" />
            <span className="text-sm text-htg-fg-muted">Ten tydzień</span>
          </div>
          <p className="text-2xl font-serif font-bold text-htg-fg">{sessionsThisWeek}</p>
          <p className="text-xs text-htg-fg-muted">zaplanowanych sesji</p>
        </div>

        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-htg-warm" />
            <span className="text-sm text-htg-fg-muted">Łącznie</span>
          </div>
          <p className="text-2xl font-serif font-bold text-htg-fg">{upcomingBookings.length}</p>
          <p className="text-xs text-htg-fg-muted">nadchodzących sesji</p>
        </div>
      </div>

      {/* TODAY'S SESSIONS — prominent */}
      {todaySessions.length > 0 && (
        <div className="bg-htg-sage/10 border-2 border-htg-sage/30 rounded-2xl p-6">
          <h2 className="text-lg font-serif font-bold text-htg-fg mb-4 flex items-center gap-2">
            <Mic className="w-5 h-5 text-htg-sage" />
            Dzisiejsze sesje
          </h2>
          <div className="space-y-3">
            {todaySessions.map((booking: any) => {
              const slot = getSlot(booking);
              const client = getClient(booking);
              const sessionStart = slot ? new Date(slot.slot_date + 'T' + slot.start_time + '+02:00') : null; // CEST
              const hoursUntil = sessionStart ? (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60) : Infinity;
              const canJoin = hoursUntil <= 0.5 && hoursUntil > -3;
              const isNow = hoursUntil <= 0 && hoursUntil > -3;

              return (
                <div key={booking.id} className={`flex items-center gap-4 p-4 rounded-xl border ${
                  isNow ? 'bg-htg-warm/10 border-htg-warm/40 animate-pulse' :
                  canJoin ? 'bg-htg-sage/10 border-htg-sage/40' :
                  'bg-htg-card border-htg-card-border'
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-htg-fg">
                        {slot?.start_time?.slice(0, 5)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                        {SESSION_CONFIG[booking.session_type as SessionType]?.labelShort || booking.session_type}
                      </span>
                      {isNow && <span className="text-xs px-2 py-0.5 rounded-full bg-htg-warm text-white font-bold">TERAZ</span>}
                    </div>
                    <p className="text-sm text-htg-fg-muted">
                      Klient: <span className="text-htg-fg font-medium">{client?.display_name || client?.email || '—'}</span>
                    </p>
                    {booking.topics && (
                      <p className="text-xs text-htg-fg-muted mt-1 line-clamp-1">
                        Zagadnienia: {booking.topics}
                      </p>
                    )}
                  </div>

                  {/* Join button */}
                  {booking.live_session_id && canJoin && (
                    <Link
                      href={`/live/${booking.live_session_id}` as any}
                      className="bg-htg-warm text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-htg-warm/90 transition-colors flex items-center gap-2 shrink-0"
                    >
                      <Mic className="w-4 h-4" />
                      {isNow ? 'Wejdź na sesję' : 'Dołącz'}
                    </Link>
                  )}

                  {!booking.live_session_id && canJoin && (
                    <CreateRoomButton bookingId={booking.id} />
                  )}

                  {!canJoin && (
                    <span className="text-xs text-htg-fg-muted shrink-0">
                      za {Math.ceil(hoursUntil)}h
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* UPCOMING SESSIONS — table */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="text-lg font-serif font-bold text-htg-fg mb-4">Nadchodzące sesje</h2>

        {upcomingBookings.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Brak zaplanowanych sesji.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-htg-fg-muted border-b border-htg-card-border">
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2 pr-4">Godzina</th>
                  <th className="pb-2 pr-4">Klient</th>
                  <th className="pb-2 pr-4"></th>
                  <th className="pb-2 pr-4">Zagadnienia</th>
                  <th className="pb-2"></th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {upcomingBookings.map((booking: any) => {
                  const slot = getSlot(booking);
                  const client = getClient(booking);
                  const isToday = slot?.slot_date === todayStr;

                  return (
                    <tr key={booking.id} className={`border-b border-htg-card-border last:border-0 hover:bg-htg-surface/50 cursor-pointer ${isToday ? 'bg-htg-sage/5' : ''}`}>
                      <td className="py-3 pr-4 text-htg-fg font-medium whitespace-nowrap">
                        <Link href={`/prowadzacy/sesje/${booking.id}` as any} className="hover:underline">
                          {isToday && <span className="text-htg-sage text-xs font-bold mr-1">DZIŚ</span>}
                          {slot?.slot_date || '—'}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-htg-fg">{slot?.start_time?.slice(0,5) || '—'}</td>
                      <td className="py-3 pr-4 text-htg-fg">
                        <Link href={`/prowadzacy/sesje/${booking.id}` as any} className="hover:underline">
                          {client?.display_name || client?.email || '—'}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        {(() => { const tb = SESSION_TYPE_BADGE[booking.session_type]; return tb ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${tb.className}`}>{SESSION_CONFIG[booking.session_type as SessionType]?.labelShort || booking.session_type}</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">{booking.session_type}</span>
                        ); })()}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {booking.topics ? <span className="text-htg-sage">Jest</span> : ''}
                      </td>
                      <td className="py-3 pr-4">
                        <PaymentStatusBadge
                          bookingId={booking.id}
                          initialStatus={booking.payment_status || 'pending_verification'}
                          canEdit={isPractitioner}
                        />
                      </td>
                      <td className="py-3">
                        {booking.live_session_id ? (
                          <Link
                            href={`/live/${booking.live_session_id}` as any}
                            className="text-htg-sage hover:text-htg-sage-dark text-xs font-medium flex items-center gap-1"
                          >
                            Wejdź <ArrowRight className="w-3 h-3" />
                          </Link>
                        ) : (
                          <Link
                            href={`/prowadzacy/sesje/${booking.id}` as any}
                            className="text-htg-fg-muted hover:text-htg-fg text-xs flex items-center gap-1"
                          >
                            Szczegóły <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stripe Connect — for assistants only (not practitioner) */}
      {!isPractitioner && (
        <StripeConnectCard />
      )}
    </div>
  );
}
