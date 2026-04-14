import { setRequestLocale } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Calendar } from 'lucide-react';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const MONTH_NAMES = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export default async function TranslatorGrafikPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;

  const db = createSupabaseServiceRole();
  const todayStr = new Date().toISOString().split('T')[0];

  // Next 60 days
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 60);
  const endStr = endDate.toISOString().split('T')[0];

  const { data: rawBookings } = await db
    .from('bookings')
    .select(`
      id, session_type, status, topics, live_session_id, user_id,
      slot:booking_slots!inner(slot_date, start_time, end_time)
    `)
    .in('status', ['confirmed', 'pending_confirmation'])
    .gte('slot.slot_date', todayStr)
    .lte('slot.slot_date', endStr)
    .order('slot_date', { referencedTable: 'booking_slots', ascending: true })
    .limit(300);

  const userIds = [...new Set((rawBookings || []).map((b: any) => b.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0
    ? await db.from('profiles').select('id, email, display_name').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const bookings = (rawBookings || []).map((b: any) => ({
    ...b,
    slot: Array.isArray(b.slot) ? b.slot[0] : b.slot,
    client: profileMap.get(b.user_id) || null,
  }));

  // Group by date
  const grouped = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const d = b.slot?.slot_date;
    if (!d) continue;
    if (!grouped.has(d)) grouped.set(d, []);
    grouped.get(d)!.push(b);
  }
  const sortedDates = Array.from(grouped.keys()).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="w-6 h-6 text-htg-indigo" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Grafik</h2>
        <span className="text-sm text-htg-fg-muted">— kolejne 60 dni</span>
      </div>

      {sortedDates.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <Calendar className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted">Brak zaplanowanych sesji w ciągu najbliższych 60 dni.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(dateStr => {
            const isToday = dateStr === todayStr;
            const sessions = grouped.get(dateStr)!;
            return (
              <div
                key={dateStr}
                className={`rounded-xl border overflow-hidden ${
                  isToday ? 'border-htg-sage/50' : 'border-htg-card-border'
                }`}
              >
                {/* Date header */}
                <div className={`px-5 py-3 flex items-center justify-between ${
                  isToday ? 'bg-htg-sage/10' : 'bg-htg-surface/30'
                }`}>
                  <div className="flex items-center gap-3">
                    {isToday && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>
                    )}
                    <span className={`font-semibold text-sm ${isToday ? 'text-htg-sage' : 'text-htg-fg'}`}>
                      {formatDate(dateStr)}
                    </span>
                    <span className="text-xs text-htg-fg-muted">{dateStr}</span>
                  </div>
                  <span className="text-xs text-htg-fg-muted">
                    {sessions.length} {sessions.length === 1 ? 'sesja' : sessions.length < 5 ? 'sesje' : 'sesji'}
                  </span>
                </div>

                {/* Sessions */}
                <div className="divide-y divide-htg-card-border">
                  {sessions.map((b: any) => (
                    <div key={b.id} className="flex items-center gap-4 px-5 py-3 bg-htg-card hover:bg-htg-surface/30 transition-colors">
                      <span className="text-sm font-bold text-htg-fg w-14 shrink-0">
                        {b.slot?.start_time?.slice(0, 5)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted shrink-0">
                        {SESSION_CONFIG[b.session_type as SessionType]?.labelShort || b.session_type}
                      </span>
                      <span className="text-sm text-htg-fg flex-1 truncate">
                        {b.client?.display_name || b.client?.email || '—'}
                      </span>
                      {b.topics && (
                        <span className="text-xs text-htg-fg-muted hidden sm:block truncate max-w-[200px]">
                          📝 {b.topics}
                        </span>
                      )}
                      {b.live_session_id && isToday && (
                        <Link
                          href={{ pathname: '/live/[sessionId]', params: { sessionId: b.live_session_id } }}
                          className="text-xs text-htg-warm font-medium hover:underline shrink-0"
                        >
                          Dołącz
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
