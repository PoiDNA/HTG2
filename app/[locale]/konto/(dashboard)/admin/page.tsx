import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { redirect } from '@/i18n-config';
import { cookies } from 'next/headers';
import { startImpersonation, startUserImpersonation } from '@/lib/admin/impersonate';
import { IMPERSONATE_COOKIE } from '@/lib/admin/impersonate-const';
import { Calendar, Users, Clock, ExternalLink, Eye, BookOpen, MessagesSquare, Mail } from 'lucide-react';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AdminDashboard({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Admin' });

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) redirect({href: '/konto', locale});

  const supabase = createSupabaseServiceRole();

  // Current staff impersonation
  const cookieStore = await cookies();
  const currentViewAs = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null;

  const today = new Date().toISOString().split('T')[0];

  // Fetch stats in parallel
  const [bookingsRes, pendingRes, queueRes, todayRes, recentRes] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending_confirmation'),
    supabase.from('acceleration_queue').select('id', { count: 'exact', head: true }).in('status', ['waiting', 'offered']),
    supabase.from('booking_slots').select('id', { count: 'exact', head: true }).eq('slot_date', today).eq('status', 'booked'),
    supabase.from('bookings').select('id, user_id, session_type, status, assigned_at, slot:booking_slots(slot_date, start_time)').order('assigned_at', { ascending: false }).limit(10),
  ]);

  const stats = [
    { label: t('stats_total_bookings'), value: bookingsRes.count ?? 0 },
    { label: t('stats_pending'), value: pendingRes.count ?? 0 },
    { label: t('stats_queue_size'), value: queueRes.count ?? 0 },
    { label: t('stats_today'), value: todayRes.count ?? 0 },
  ];

  const recentBookings = recentRes.data ?? [];

  // Fetch additional stats
  const [usersRes, entsRes, staffRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('entitlements').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('staff_members').select('id, name, slug, role, session_types, email, locale').eq('is_active', true),
  ]);

  const staffMembers = staffRes.data ?? [];

  function staffRoleLabel(role: string, locale?: string | null) {
    if (role === 'practitioner') return 'Prowadząca';
    if (role === 'translator') return locale ? `Tłumaczka ${locale.toUpperCase()}` : 'Tłumaczka';
    return 'Operatorka';
  }

  const quickLinks = [
    { href: '/konto/admin/uzytkownicy' as const, label: 'Użytkownicy', icon: Users },
    { href: '/konto/admin/sesje' as const, label: 'Sesje', icon: BookOpen },
    { href: '/konto/admin/podglad' as const, label: 'Podgląd użytkowników', icon: Eye },
    { href: '/spolecznosc' as const, label: 'Społeczność', icon: MessagesSquare },
    { href: '/konto/admin/skrzynka' as const, label: 'Skrzynka', icon: Mail },
    { href: '/konto/admin/kalendarz' as const, label: t('go_to_calendar'), icon: Calendar },
    { href: '/konto/admin/kolejka' as const, label: t('go_to_queue'), icon: Users },
    { href: '/konto/admin/sloty' as const, label: t('go_to_slots'), icon: Clock },
  ];

  return (
    <div className="space-y-8">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-htg-card border border-htg-card-border rounded-xl p-5">
            <p className="text-sm text-htg-fg-muted">{stat.label}</p>
            <p className="text-3xl font-serif font-bold text-htg-fg mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Platform overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <p className="text-sm text-htg-fg-muted">Użytkownicy</p>
          <p className="text-3xl font-serif font-bold text-htg-fg mt-1">{usersRes.count ?? 0}</p>
          <Link href="/konto/admin/uzytkownicy" className="text-sm text-htg-sage hover:underline mt-2 inline-block">Zarządzaj →</Link>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <p className="text-sm text-htg-fg-muted">Aktywne entitlements</p>
          <p className="text-3xl font-serif font-bold text-htg-fg mt-1">{entsRes.count ?? 0}</p>
          <Link href="/konto/admin/subskrypcje" className="text-sm text-htg-sage hover:underline mt-2 inline-block">Przegląd →</Link>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <p className="text-sm text-htg-fg-muted">Zestawy miesięczne</p>
          <p className="text-3xl font-serif font-bold text-htg-fg mt-1">33</p>
          <Link href="/konto/admin/zestawy" className="text-sm text-htg-sage hover:underline mt-2 inline-block">Zarządzaj →</Link>
        </div>
      </div>

      {/* Role panels — View As */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-serif font-bold text-htg-fg">Podgląd paneli</h2>
            <p className="text-sm text-htg-fg-muted">Otwórz panel jako dowolny pracownik lub użytkownik</p>
          </div>
          <Link href="/konto/admin/podglad" className="text-xs text-htg-sage hover:underline">
            Zaawansowany podgląd →
          </Link>
        </div>

        {currentViewAs && (
          <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-htg-warm/10 border border-htg-warm/30 rounded-lg text-xs text-htg-warm">
            <Eye className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Aktywny podgląd pracownika. <a href={`/${locale}/prowadzacy`} className="underline font-medium">Otwórz panel →</a></span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Staff impersonation buttons */}
          {staffMembers.map(s => {
            const isActive = s.id === currentViewAs;
            const isPractitioner = s.role === 'practitioner';
            return (
              <form key={s.id} action={startImpersonation}>
                <input type="hidden" name="staffId" value={s.id} />
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors
                    ${isActive
                      ? 'bg-htg-warm/10 border-htg-warm/50'
                      : isPractitioner
                        ? 'bg-htg-surface border-htg-card-border hover:border-htg-indigo/50'
                        : 'bg-htg-surface border-htg-card-border hover:border-htg-sage/50'
                    }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0
                    ${isPractitioner ? 'bg-htg-indigo' : 'bg-htg-sage'}`}>
                    {s.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-htg-fg text-sm">{s.name}</p>
                    <p className="text-xs text-htg-fg-muted">{staffRoleLabel(s.role, (s as any).locale)}</p>
                  </div>
                  <ExternalLink className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-htg-warm' : 'text-htg-fg-muted'}`} />
                </button>
              </form>
            );
          })}

          {/* User panel — search form */}
          <div className="bg-htg-surface border border-htg-card-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-htg-indigo" />
              <span className="font-medium text-htg-fg text-sm">Panel użytkownika</span>
            </div>
            <p className="text-xs text-htg-fg-muted">Wejdź w widok konta dowolnego klienta</p>
            <form action={startUserImpersonation} className="flex flex-col gap-2">
              <input type="hidden" name="locale" value={locale} />
              <input
                name="email"
                type="email"
                placeholder="email użytkownika…"
                required
                className="w-full px-3 py-1.5 bg-htg-card border border-htg-card-border rounded-lg text-xs text-htg-fg placeholder:text-htg-fg-muted focus:outline-none focus:border-htg-indigo"
              />
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-htg-indigo/20 hover:bg-htg-indigo/40 text-htg-cream/80 rounded-lg text-xs font-medium transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Otwórz jako użytkownik
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Staff overview */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="text-xl font-serif font-bold text-htg-fg mb-4">Zespół HTG</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {staffMembers.map(member => (
            <div key={member.slug} className="bg-htg-surface rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  member.role === 'practitioner' ? 'bg-htg-indigo' : 'bg-htg-sage'
                }`}>
                  {member.name[0]}
                </div>
                <div>
                  <p className="font-medium text-htg-fg">{member.name}</p>
                  <p className="text-xs text-htg-fg-muted">{staffRoleLabel(member.role, (member as any).locale)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(member.session_types as string[]).map(st => (
                  <span key={st} className="px-2 py-0.5 bg-htg-card rounded text-xs text-htg-fg-muted">
                    {SESSION_CONFIG[st as SessionType]?.labelShort ?? st}
                  </span>
                ))}
              </div>
              <p className="text-xs text-htg-fg-muted mt-2">{member.email}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent bookings */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="text-xl font-serif font-bold text-htg-fg mb-4">{t('recent_bookings')}</h2>
        {recentBookings.length === 0 ? (
          <p className="text-htg-fg-muted">{t('no_data')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-htg-card-border text-left">
                  <th className="py-2 pr-4 text-htg-fg-muted font-medium">{t('col_session_type')}</th>
                  <th className="py-2 pr-4 text-htg-fg-muted font-medium">{t('col_date')}</th>
                  <th className="py-2 pr-4 text-htg-fg-muted font-medium">{t('col_time')}</th>
                  <th className="py-2 text-htg-fg-muted font-medium">{t('col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((booking: any) => (
                  <tr key={booking.id} className="border-b border-htg-card-border last:border-0">
                    <td className="py-3 pr-4">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${SESSION_CONFIG[booking.session_type as SessionType]?.color ?? ''}`} />
                      {SESSION_CONFIG[booking.session_type as SessionType]?.labelShort ?? booking.session_type}
                    </td>
                    <td className="py-3 pr-4 text-htg-fg-muted">{booking.slot?.slot_date ?? '—'}</td>
                    <td className="py-3 pr-4 text-htg-fg-muted">{booking.slot?.start_time ?? '—'}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        booking.status === 'confirmed' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                        booking.status === 'pending_confirmation' ? 'bg-htg-warm/20 text-htg-warm-text' :
                        booking.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-htg-surface text-htg-fg-muted'
                      }`}>
                        {booking.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-xl font-serif font-bold text-htg-fg mb-4">{t('quick_links')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {quickLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 bg-htg-card border border-htg-card-border rounded-xl p-5 hover:bg-htg-surface transition-colors"
            >
              <Icon className="w-5 h-5 text-htg-indigo" />
              <span className="text-sm font-medium text-htg-fg">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
