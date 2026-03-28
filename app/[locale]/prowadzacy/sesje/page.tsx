import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Link } from '@/i18n-config';
import { Presentation, ArrowRight, Mic, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react';

const SESSION_LABELS: Record<string, string> = {
  natalia_solo: 'Sesja 1:1 z Natalią',
  natalia_agata: 'Sesja z Natalią i Agatą',
  natalia_justyna: 'Sesja z Natalią i Justyną',
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function StaffSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { staffMember } = await getEffectiveStaffMember();
  const admin = createSupabaseServiceRole();

  const isPractitioner = staffMember?.role === 'practitioner';
  const sessionTypes = isPractitioner
    ? ['natalia_solo', 'natalia_agata', 'natalia_justyna', 'natalia_para']
    : (staffMember?.session_types || []);

  // Fetch all bookings (past + future)
  const { data: bookings } = await admin
    .from('bookings')
    .select(`
      id, session_type, status, topics, live_session_id, created_at,
      slot:booking_slots!inner(slot_date, start_time, end_time),
      user_id
    `)
    .in('session_type', sessionTypes)
    .in('status', ['confirmed', 'completed', 'pending_confirmation'])
    .order('created_at', { ascending: false })
    .limit(500);

  // Fetch profiles separately
  const userIds = [...new Set((bookings || []).map((b: any) => b.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0 ? await admin.from('profiles').select('id, email, display_name').in('id', userIds) : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const enrichedBookings = (bookings || []).map((b: any) => ({ ...b, client: profileMap.get(b.user_id) || null }));

  const todayStr = new Date().toISOString().split('T')[0];

  const sortBySlotAsc = (a: any, b: any) => {
    const sa = Array.isArray(a.slot) ? a.slot[0] : a.slot;
    const sb = Array.isArray(b.slot) ? b.slot[0] : b.slot;
    return (sa?.slot_date + sa?.start_time).localeCompare(sb?.slot_date + sb?.start_time);
  };
  const sortBySlotDesc = (a: any, b: any) => -sortBySlotAsc(a, b);

  const upcoming = enrichedBookings
    .filter((b: any) => {
      const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
      return slot?.slot_date >= todayStr && b.status !== 'completed';
    })
    .sort(sortBySlotAsc);

  const past = enrichedBookings
    .filter((b: any) => {
      const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
      return slot?.slot_date < todayStr || b.status === 'completed';
    })
    .sort(sortBySlotDesc);

  function getSlot(b: any) { return Array.isArray(b.slot) ? b.slot[0] : b.slot; }
  function getClient(b: any) { return Array.isArray(b.client) ? b.client[0] : b.client; }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Presentation className="w-6 h-6 text-htg-indigo" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Moje sesje</h2>
      </div>

      {/* Upcoming */}
      <div>
        <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-htg-sage" />
          Nadchodzące ({upcoming.length})
        </h3>

        {upcoming.length === 0 ? (
          <p className="text-htg-fg-muted text-sm bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
            Brak zaplanowanych sesji.
          </p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((b: any) => {
              const slot = getSlot(b);
              const client = getClient(b);
              const isToday = slot?.slot_date === todayStr;
              const sessionStart = slot ? new Date(slot.slot_date + 'T' + slot.start_time) : null;
              const canJoin = sessionStart ? (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60) <= 0.5 : false;

              return (
                <div key={b.id} className={`flex items-center gap-4 p-4 rounded-xl border ${
                  isToday ? 'bg-htg-sage/5 border-htg-sage/30' : 'bg-htg-card border-htg-card-border'
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isToday && <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>}
                      <span className="font-bold text-htg-fg">{slot?.slot_date}</span>
                      <span className="text-htg-fg">{slot?.start_time?.slice(0, 5)}–{slot?.end_time?.slice(0, 5)}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                        {SESSION_LABELS[b.session_type] || b.session_type}
                      </span>
                    </div>
                    <p className="text-sm text-htg-fg-muted mt-1">
                      {client?.display_name || client?.email || '—'}
                    </p>
                    {b.topics && (
                      <p className="text-xs text-htg-fg-muted mt-1 line-clamp-2">📝 {b.topics}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {b.status === 'pending_confirmation' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-900/30 text-yellow-400">
                        <AlertCircle className="w-3 h-3 inline mr-1" />Oczekuje
                      </span>
                    )}
                    {b.live_session_id && canJoin && (
                      <Link
                        href={`/live/${b.live_session_id}` as any}
                        className="bg-htg-warm text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-htg-warm/90 transition-colors flex items-center gap-1"
                      >
                        <Mic className="w-4 h-4" /> Wejdź
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past sessions */}
      {past.length > 0 && (
        <div>
          <h3 className="text-lg font-serif font-semibold text-htg-fg-muted mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-htg-fg-muted" />
            Zakończone ({past.length})
          </h3>
          <div className="space-y-2 opacity-70">
            {past.slice(0, 20).map((b: any) => {
              const slot = getSlot(b);
              const client = getClient(b);
              return (
                <div key={b.id} className="flex items-center gap-4 p-3 rounded-xl bg-htg-card border border-htg-card-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-htg-fg-muted">{slot?.slot_date}</span>
                      <span className="text-htg-fg-muted">{slot?.start_time?.slice(0, 5)}</span>
                      <span className="text-xs text-htg-fg-muted">{SESSION_LABELS[b.session_type] || b.session_type}</span>
                    </div>
                    <p className="text-xs text-htg-fg-muted">{client?.display_name || client?.email || '—'}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                    <CheckCircle className="w-3 h-3 inline mr-1" />Zakończona
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
