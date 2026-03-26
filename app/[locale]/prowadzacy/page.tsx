import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { Calendar, Clock, Users } from 'lucide-react';

export default async function StaffDashboard({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Staff' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Find staff member
  let staffMember = null;
  if (user) {
    const { data: byUserId } = await supabase
      .from('staff_members')
      .select('id, name, role, session_types')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (byUserId) {
      staffMember = byUserId;
    } else if (user.email) {
      const { data: byEmail } = await supabase
        .from('staff_members')
        .select('id, name, role, session_types')
        .eq('email', user.email)
        .eq('is_active', true)
        .single();
      staffMember = byEmail;
    }
  }

  // Get upcoming bookings for this staff member's session types
  const now = new Date().toISOString().split('T')[0];
  const sessionTypes = staffMember?.session_types || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let upcomingBookings: any[] = [];
  let sessionsThisWeek = 0;
  let nextSessionDate: string | null = null;

  if (staffMember && sessionTypes.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, session_type, status, slot:booking_slots(slot_date, start_time, end_time), user:profiles!bookings_user_id_fkey(email, display_name)')
      .in('session_type', sessionTypes)
      .in('status', ['pending_confirmation', 'confirmed'])
      .order('assigned_at', { ascending: true })
      .limit(10);

    if (bookings) {
      upcomingBookings = bookings;
    }

    // Count sessions this week
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .in('session_type', sessionTypes)
      .eq('status', 'confirmed');

    sessionsThisWeek = count || 0;

    // Next session
    const { data: nextSlot } = await supabase
      .from('booking_slots')
      .select('slot_date, start_time')
      .in('session_type', sessionTypes)
      .eq('status', 'booked')
      .gte('slot_date', now)
      .order('slot_date')
      .order('start_time')
      .limit(1)
      .single();

    if (nextSlot) {
      nextSessionDate = `${nextSlot.slot_date} ${nextSlot.start_time}`;
    }
  }

  return (
    <div className="space-y-8">
      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-htg-sage" />
            <span className="text-sm text-htg-fg-muted">{t('stats_sessions_week')}</span>
          </div>
          <p className="text-2xl font-serif font-bold text-htg-fg">{sessionsThisWeek}</p>
        </div>

        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-htg-indigo" />
            <span className="text-sm text-htg-fg-muted">{t('stats_next_session')}</span>
          </div>
          <p className="text-lg font-medium text-htg-fg">
            {nextSessionDate || t('no_upcoming')}
          </p>
        </div>

        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-htg-mauve" />
            <span className="text-sm text-htg-fg-muted">{t('stats_session_types')}</span>
          </div>
          <p className="text-lg font-medium text-htg-fg">{sessionTypes.length}</p>
        </div>
      </div>

      {/* Upcoming bookings */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('upcoming_sessions')}</h2>

        {upcomingBookings.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">{t('no_upcoming')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-htg-fg-muted border-b border-htg-card-border">
                  <th className="pb-2 pr-4">{t('col_date')}</th>
                  <th className="pb-2 pr-4">{t('col_time')}</th>
                  <th className="pb-2 pr-4">{t('col_user')}</th>
                  <th className="pb-2 pr-4">{t('col_type')}</th>
                  <th className="pb-2">{t('col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {upcomingBookings.map(booking => {
                  const slot = Array.isArray(booking.slot) ? booking.slot[0] : booking.slot;
                  const bookingUser = Array.isArray(booking.user) ? booking.user[0] : booking.user;
                  return (
                    <tr key={booking.id} className="border-b border-htg-card-border last:border-0">
                      <td className="py-3 pr-4 text-htg-fg">{slot?.slot_date || '—'}</td>
                      <td className="py-3 pr-4 text-htg-fg">{slot ? `${slot.start_time}–${slot.end_time}` : '—'}</td>
                      <td className="py-3 pr-4 text-htg-fg">{bookingUser?.display_name || bookingUser?.email || '—'}</td>
                      <td className="py-3 pr-4 text-htg-fg-muted">{booking.session_type}</td>
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          booking.status === 'confirmed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {booking.status === 'confirmed' ? t('status_confirmed') : t('status_pending')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
