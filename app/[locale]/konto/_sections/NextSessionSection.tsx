import { getEffectiveUser } from '@/lib/admin/effective-user';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import { getSessionCountdown, formatCountdownParts } from '@/lib/booking/countdown-phrases';
import type { SessionType } from '@/lib/booking/types';
import { Calendar } from 'lucide-react';

export default async function NextSessionSection({ locale }: { locale: string }) {
  const { userId, supabase } = await getEffectiveUser();

  // Fetch next confirmed booking with slot
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, session_type, status,
      slot:booking_slots(id, slot_date, start_time, end_time)
    `)
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!bookings || bookings.length === 0) return null;

  // Find the nearest future session
  const now = new Date();
  const futureBookings = bookings
    .map(b => {
      const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
      if (!slot?.slot_date || !slot?.start_time) return null;
      const sessionDate = new Date(`${slot.slot_date}T${slot.start_time}+02:00`);
      return { booking: b, slot, sessionDate };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.sessionDate > now)
    .sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime());

  if (futureBookings.length === 0) return null;

  const { booking, slot } = futureBookings[0];
  const config = SESSION_CONFIG[booking.session_type as SessionType];

  // Countdown
  const todayYmd = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  const normalizedLocale = locale === 'pl' ? 'pl' : 'en';
  const countdown = getSessionCountdown(booking.id, slot.slot_date, todayYmd);
  const cdParts = countdown ? formatCountdownParts(countdown.months, countdown.days, normalizedLocale) : null;

  const dateStr = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(slot.slot_date + 'T00:00:00'));

  const timeStr = `${slot.start_time.slice(0, 5)} – ${slot.end_time.slice(0, 5)}`;

  return (
    <div className="mb-8">
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">Twoja Sesja</p>
            {cdParts && (
              <div style={{ fontFamily: 'Nunito, sans-serif' }}>
                {cdParts.monthsLine && (
                  <p className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-4xl font-bold text-htg-sage">{cdParts.monthsLine.number}</span>
                    <span className="text-xl font-bold text-htg-sage/70">{cdParts.monthsLine.label}</span>
                  </p>
                )}
                {cdParts.daysLine && (
                  <p className="flex items-baseline gap-1.5 leading-none mt-1">
                    <span className="text-4xl font-bold text-htg-sage">{cdParts.daysLine.number}</span>
                    <span className="text-xl font-bold text-htg-sage/70">{cdParts.daysLine.label}</span>
                  </p>
                )}
                <p className="text-sm text-htg-sage/60 mt-1">{cdParts.suffix}</p>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1.5 text-sm text-htg-fg-muted justify-end mb-1">
              <Calendar className="w-4 h-4" />
              <span className="capitalize">{dateStr}</span>
            </div>
            <p className="text-sm font-medium text-htg-fg">{timeStr}</p>
            {config && (
              <p className="text-xs text-htg-fg-muted mt-1">{config.label}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
