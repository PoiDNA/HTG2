import { setRequestLocale } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isTranslatorEmail, TRANSLATOR_LOCALE } from '@/lib/roles';
import { Calendar, Clock, Users, Languages, Send, CheckCircle, ArrowRight } from 'lucide-react';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function TranslatorDashboard({
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

  // Upcoming sessions (all — translator covers all)
  const { data: rawBookings } = await db
    .from('bookings')
    .select(`
      id, session_type, status, topics, live_session_id, user_id,
      slot:booking_slots!inner(slot_date, start_time, end_time)
    `)
    .in('status', ['confirmed', 'pending_confirmation'])
    .gte('slot.slot_date', todayStr)
    .order('slot_date', { referencedTable: 'booking_slots', ascending: true })
    .limit(200);

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

  const todaySessions = bookings.filter((b: any) => b.slot?.slot_date === todayStr);

  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const thisWeek = bookings.filter((b: any) => b.slot?.slot_date && b.slot.slot_date <= weekEndStr);

  // Translation issues submitted by this translator
  const { data: myIssues } = await db
    .from('translation_issues')
    .select('id, status, created_at')
    .eq('reporter_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const openIssues = (myIssues || []).filter((i: any) => i.status === 'open').length;
  const resolvedIssues = (myIssues || []).filter((i: any) => i.status === 'resolved').length;

  const assignedLocale = TRANSLATOR_LOCALE[user.email?.toLowerCase() ?? ''] ?? null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-bold text-htg-fg">
          Witaj, {user.email?.split('@')[0]}
        </h1>
        <p className="text-htg-fg-muted text-sm mt-1">
          {todayStr}
          {assignedLocale && (
            <> &mdash; Twój język: <span className="font-medium uppercase">{assignedLocale}</span></>
          )}
        </p>
      </div>

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
            <Clock className="w-5 h-5 text-htg-indigo" />
            <span className="text-sm text-htg-fg-muted">Ten tydzień</span>
          </div>
          <p className="text-2xl font-serif font-bold text-htg-fg">{thisWeek.length}</p>
          <p className="text-xs text-htg-fg-muted">zaplanowanych sesji</p>
        </div>

        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Languages className="w-5 h-5 text-htg-warm" />
            <span className="text-sm text-htg-fg-muted">Korekty językowe</span>
          </div>
          <p className="text-2xl font-serif font-bold text-htg-fg">{openIssues}</p>
          <p className="text-xs text-htg-fg-muted">otwartych · {resolvedIssues} rozwiązanych</p>
        </div>
      </div>

      {/* Today's sessions */}
      {todaySessions.length > 0 && (
        <div className="bg-htg-sage/10 border-2 border-htg-sage/30 rounded-2xl p-6">
          <h2 className="text-lg font-serif font-bold text-htg-fg mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-htg-sage" />
            Dzisiejsze sesje
          </h2>
          <div className="space-y-3">
            {todaySessions.map((b: any) => (
              <div key={b.id} className="flex items-center gap-4 p-4 bg-htg-card border border-htg-card-border rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-htg-fg">{b.slot?.start_time?.slice(0, 5)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                      {SESSION_CONFIG[b.session_type as SessionType]?.labelShort || b.session_type}
                    </span>
                  </div>
                  <p className="text-sm text-htg-fg-muted">
                    Klient: <span className="text-htg-fg font-medium">{b.client?.display_name || b.client?.email || '—'}</span>
                  </p>
                </div>
                {b.live_session_id && (
                  <Link
                    href={{ pathname: '/live/[sessionId]', params: { sessionId: b.live_session_id } }}
                    className="bg-htg-warm text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-htg-warm/90 transition-colors flex items-center gap-2 shrink-0"
                  >
                    Dołącz <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming sessions preview */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-serif font-bold text-htg-fg">Nadchodzące sesje</h2>
          <Link href="/tlumacz/sesje" className="text-sm text-htg-indigo hover:underline flex items-center gap-1">
            Wszystkie <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {bookings.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Brak zaplanowanych sesji.</p>
        ) : (
          <div className="space-y-2">
            {bookings.slice(0, 6).map((b: any) => (
              <div key={b.id} className="flex items-center gap-4 py-2 border-b border-htg-card-border last:border-0">
                <span className="text-sm font-medium text-htg-fg w-24 shrink-0">{b.slot?.slot_date}</span>
                <span className="text-sm text-htg-fg w-12 shrink-0">{b.slot?.start_time?.slice(0, 5)}</span>
                <span className="text-sm text-htg-fg-muted flex-1 truncate">{b.client?.display_name || b.client?.email || '—'}</span>
                <span className="text-xs text-htg-fg-muted">
                  {SESSION_CONFIG[b.session_type as SessionType]?.labelShort || b.session_type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links to translation reporting */}
      <div className="bg-htg-indigo/10 border border-htg-indigo/30 rounded-xl p-5 flex items-start gap-4">
        <Send className="w-5 h-5 text-htg-indigo mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-htg-fg mb-1">Zgłoś błąd w tłumaczeniu</p>
          <p className="text-xs text-htg-fg-muted mb-3">
            Znalazłeś/aś błąd lub nieścisłość w tłumaczeniu platformy? Przejdź do panelu korekt.
          </p>
          <Link
            href="/konto/tlumacz"
            className="inline-flex items-center gap-2 text-sm text-htg-indigo hover:underline font-medium"
          >
            Otwórz panel korekt <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {resolvedIssues > 0 && (
          <div className="flex items-center gap-1 text-xs text-green-600 shrink-0">
            <CheckCircle className="w-4 h-4" />
            {resolvedIssues} rozwiązane
          </div>
        )}
      </div>
    </div>
  );
}
