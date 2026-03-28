import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Calendar, Clock, Users, Mic, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n-config';
import StripeConnectCard from '@/components/staff/StripeConnectCard';
import InitiateCallModal from '@/components/quick-call/InitiateCallModal';
import ActiveCallsWidget from '@/components/quick-call/ActiveCallsWidget';

const SESSION_LABELS: Record<string, string> = {
  natalia_solo: 'Sesja 1:1 z Natalią',
  natalia_agata: 'Sesja z Natalią i Agatą',
  natalia_justyna: 'Sesja z Natalią i Justyną',
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
        id, session_type, status, topics, live_session_id, user_id,
        slot:booking_slots!inner(slot_date, start_time, end_time)
      `)
      .in('session_type', isPractitioner ? ['natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_para'] : sessionTypes)
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
                        {slot?.start_time?.slice(0, 5)}–{slot?.end_time?.slice(0, 5)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                        {SESSION_LABELS[booking.session_type] || booking.session_type}
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
                    <span className="text-xs text-htg-fg-muted bg-htg-surface px-3 py-2 rounded-lg shrink-0">
                      Poczekalnia za chwilę...
                    </span>
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
                  <th className="pb-2 pr-4">Typ</th>
                  <th className="pb-2 pr-4">Zagadnienia</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {upcomingBookings.map((booking: any) => {
                  const slot = getSlot(booking);
                  const client = getClient(booking);
                  const isToday = slot?.slot_date === todayStr;

                  return (
                    <tr key={booking.id} className={`border-b border-htg-card-border last:border-0 ${isToday ? 'bg-htg-sage/5' : ''}`}>
                      <td className="py-3 pr-4 text-htg-fg font-medium">
                        {isToday && <span className="text-htg-sage text-xs font-bold mr-1">DZIŚ</span>}
                        {slot?.slot_date || '—'}
                      </td>
                      <td className="py-3 pr-4 text-htg-fg">{slot ? `${slot.start_time?.slice(0,5)}–${slot.end_time?.slice(0,5)}` : '—'}</td>
                      <td className="py-3 pr-4 text-htg-fg">{client?.display_name || client?.email || '—'}</td>
                      <td className="py-3 pr-4">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                          {SESSION_LABELS[booking.session_type] || booking.session_type}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-htg-fg-muted text-xs max-w-[200px] truncate">
                        {booking.topics || '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          booking.status === 'confirmed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {booking.status === 'confirmed' ? 'Potwierdzona' : 'Oczekuje'}
                        </span>
                      </td>
                      <td className="py-3">
                        {booking.live_session_id && (
                          <Link
                            href={`/live/${booking.live_session_id}` as any}
                            className="text-htg-sage hover:text-htg-sage-dark text-xs font-medium flex items-center gap-1"
                          >
                            Wejdź <ArrowRight className="w-3 h-3" />
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
