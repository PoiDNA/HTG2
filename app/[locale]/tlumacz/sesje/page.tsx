import { setRequestLocale } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Presentation, Calendar, Users } from 'lucide-react';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function TranslatorSessionsPage({
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

  // Fetch staff member to know translator_id and locale for "available with me"
  const { staffMember } = await getEffectiveStaffMember();
  const translatorLocale = (staffMember as any)?.locale ?? locale;
  const translatorId = staffMember?.id ?? null;

  // Available-with-me: natalia_interpreter_solo slots where translator_id = me (next 28 days)
  const todayForSlots = new Date().toISOString().split('T')[0];
  const inFourWeeks = new Date(); inFourWeeks.setDate(inFourWeeks.getDate() + 28);
  const toDateForSlots = inFourWeeks.toISOString().split('T')[0];

  let availableWithMe: any[] = [];
  if (translatorId) {
    const { data: avSlots } = await db
      .from('booking_slots')
      .select('id, slot_date, start_time, end_time, session_type')
      .eq('session_type', `natalia_interpreter_solo`)
      .eq('translator_id', translatorId)
      .eq('status', 'available')
      .gte('slot_date', todayForSlots)
      .lte('slot_date', toDateForSlots)
      .order('slot_date').order('start_time');
    availableWithMe = avSlots || [];
  }
  const todayStr = new Date().toISOString().split('T')[0];

  const { data: rawBookings } = await db
    .from('bookings')
    .select(`
      id, session_type, status, topics, live_session_id, user_id, payment_status,
      slot:booking_slots!inner(slot_date, start_time, end_time)
    `)
    .in('status', ['confirmed', 'completed', 'pending_confirmation'])
    .order('slot_date', { referencedTable: 'booking_slots', ascending: false })
    .limit(500);

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

  const upcoming = bookings
    .filter((b: any) => b.slot?.slot_date >= todayStr && b.status !== 'completed')
    .sort((a: any, b: any) => (a.slot?.slot_date + a.slot?.start_time).localeCompare(b.slot?.slot_date + b.slot?.start_time));

  const past = bookings
    .filter((b: any) => b.slot?.slot_date < todayStr || b.status === 'completed')
    .sort((a: any, b: any) => (b.slot?.slot_date + b.slot?.start_time).localeCompare(a.slot?.slot_date + a.slot?.start_time));

  function SessionRow({ b }: { b: any }) {
    const isToday = b.slot?.slot_date === todayStr;
    return (
      <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
        isToday ? 'bg-htg-sage/5 border-htg-sage/30' : 'bg-htg-card border-htg-card-border'
      }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isToday && <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>}
            <span className="font-bold text-htg-fg">{b.slot?.slot_date || '—'}</span>
            <span className="text-htg-fg">{b.slot?.start_time?.slice(0, 5) || ''}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
              {SESSION_CONFIG[b.session_type as SessionType]?.labelShort || b.session_type}
            </span>
          </div>
          <p className="text-sm text-htg-fg-muted">
            {b.client?.display_name || b.client?.email || '—'}
            {b.client?.email && b.client?.display_name && (
              <span className="text-xs ml-1 opacity-60">{b.client.email}</span>
            )}
          </p>
          {b.topics && (
            <p className="text-xs text-htg-fg-muted mt-0.5 line-clamp-1">📝 {b.topics}</p>
          )}
        </div>
        {b.live_session_id && b.slot?.slot_date === todayStr && (
          <Link
            href={{ pathname: '/live/[sessionId]', params: { sessionId: b.live_session_id } }}
            className="bg-htg-warm text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-htg-warm/90 transition-colors shrink-0"
          >
            Dołącz
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Presentation className="w-6 h-6 text-htg-indigo" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Moje sesje</h2>
      </div>

      {/* Upcoming */}
      <div>
        <h3 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wide mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Nadchodzące ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
            <Presentation className="w-10 h-10 text-htg-fg-muted mx-auto mb-3" />
            <p className="text-htg-fg-muted">Brak nadchodzących sesji.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((b: any) => <SessionRow key={b.id} b={b} />)}
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wide mb-3">
            Minione ({past.length})
          </h3>
          <div className="space-y-2 opacity-70">
            {past.slice(0, 30).map((b: any) => <SessionRow key={b.id} b={b} />)}
            {past.length > 30 && (
              <p className="text-sm text-htg-fg-muted text-center py-2">
                + {past.length - 30} wcześniejszych sesji
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dostępne ze mną */}
      <div>
        <h3 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wide mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Dostępne ze mną ({availableWithMe.length})
        </h3>
        <p className="text-xs text-htg-fg-muted mb-3">
          Terminy Natalii w Twoim języku ({translatorLocale.toUpperCase()}), dostępne do zakupu przez klientów.
        </p>
        {availableWithMe.length === 0 ? (
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
            <Users className="w-10 h-10 text-htg-fg-muted mx-auto mb-3" />
            <p className="text-htg-fg-muted text-sm">Brak dostępnych terminów w najbliższych 28 dniach.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {availableWithMe.map((slot: any) => {
              const d = new Date(slot.slot_date + 'T00:00:00');
              const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
              const isToday = slot.slot_date === todayStr;
              return (
                <div key={slot.id} className={`bg-htg-card border rounded-lg p-3 text-center ${isToday ? 'border-htg-sage/50 bg-htg-sage/5' : 'border-htg-card-border'}`}>
                  <p className="text-xs text-htg-fg-muted">{dayNames[d.getDay()]} {slot.slot_date.split('-')[2]}.{slot.slot_date.split('-')[1]}</p>
                  <p className="text-base font-bold text-htg-fg mt-1">{slot.start_time.slice(0, 5)}</p>
                  <p className="text-xs text-htg-fg-muted">–{slot.end_time.slice(0, 5)}</p>
                  {isToday && <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
