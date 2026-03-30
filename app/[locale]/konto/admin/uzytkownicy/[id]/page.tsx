import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { redirect, notFound } from 'next/navigation';
import {
  ArrowLeft, User, Mail, Calendar, CreditCard, BookOpen, Package,
  Crown, Shield, ExternalLink, Clock,
} from 'lucide-react';
import { PAYMENT_STATUS_LABELS, SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid:       { label: PAYMENT_STATUS_LABELS.confirmed_paid,       className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  installments:         { label: PAYMENT_STATUS_LABELS.installments,         className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  partial_payment:      { label: PAYMENT_STATUS_LABELS.partial_payment,      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  pending_verification: { label: PAYMENT_STATUS_LABELS.pending_verification, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};
import AdminUserActions from './AdminUserActions';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user: adminUser } } = await sessionClient.auth.getUser();
  if (!adminUser || !isAdminEmail(adminUser.email ?? '')) redirect(`/${locale}/konto`);

  const db = createSupabaseServiceRole();

  // Load profile — with graceful fallback if optional columns not yet migrated
  let profileResult = await db
    .from('profiles')
    .select('id, display_name, email, role, wix_member_id, created_at, wix_created_at, phone')
    .eq('id', id)
    .single();

  if (profileResult.error?.code === '42703') {
    // Retry without columns that may not exist yet in production DB
    profileResult = await db
      .from('profiles')
      .select('id, display_name, email, role, wix_member_id, created_at, phone')
      .eq('id', id)
      .single();
  }

  const { data: profile, error: profileError } = profileResult;

  if (profileError) {
    console.error('Error fetching admin user profile:', profileError);
    throw new Error(`Failed to load profile: ${profileError.message}`);
  }

  if (!profile) notFound();

  // Load all user data in parallel
  const [
    entRes,
    bookRes,
    ordersRes,
    updateReqRes,
  ] = await Promise.all([
    db.from('entitlements')
      .select('id, type, scope_month, source, created_at, is_active, order_id')
      .eq('user_id', id)
      .order('created_at', { ascending: false }),

    db.from('bookings')
      .select('id, session_type, status, payment_status, created_at, slot:booking_slots(slot_date, start_time)')
      .eq('user_id', id)
      .order('created_at', { ascending: false }),

    db.from('orders')
      .select('id, amount_paid, currency, status, source, payment_method, created_at, wix_order_id')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(20),

    db.from('account_update_requests')
      .select('id, category, description, status, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false }),
  ]);

  // Log query failures for observability instead of silently returning []
  if (entRes.error) console.error('Failed to load entitlements:', entRes.error);
  if (bookRes.error) console.error('Failed to load bookings:', bookRes.error);
  if (ordersRes.error) console.error('Failed to load orders:', ordersRes.error);
  if (updateReqRes.error) console.error('Failed to load update requests:', updateReqRes.error);

  const entitlements = entRes.data || [];
  const bookings = bookRes.data || [];
  const orders = ordersRes.data || [];
  const updateRequests = updateReqRes.data || [];

  const BOOKING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    confirmed: { label: 'Potwierdzona', color: 'text-green-500' },
    pending_confirmation: { label: 'Oczekująca', color: 'text-yellow-500' },
    completed: { label: 'Zakończona', color: 'text-htg-fg-muted' },
    cancelled: { label: 'Anulowana', color: 'text-red-500' },
  };

  const roleIcon = profile.role === 'admin'
    ? <Crown className="w-4 h-4 text-htg-warm" />
    : profile.role === 'moderator'
    ? <Shield className="w-4 h-4 text-htg-sage" />
    : <User className="w-4 h-4 text-htg-fg-muted" />;

  // Group entitlements
  const sessionEntitlements = entitlements.filter(e => e.type === 'session');
  const monthlyEntitlements = entitlements.filter(e => e.type === 'monthly');
  const yearlyEntitlements = entitlements.filter(e => e.type === 'yearly');

  const getBookingDate = (b: any) => (Array.isArray(b.slot) ? b.slot[0] : b.slot)?.slot_date || '';
  const getBookingTime = (b: any) => (Array.isArray(b.slot) ? b.slot[0] : b.slot)?.start_time || '';

  const today = new Date().toISOString().slice(0, 10);
  const upcomingBookings = bookings.filter(b =>
    getBookingDate(b) >= today && b.status !== 'cancelled'
  );
  const pastBookings = bookings.filter(b =>
    getBookingDate(b) < today || b.status === 'completed'
  );

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href={`/konto/admin/uzytkownicy`}
        className="inline-flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Wróć do listy użytkowników
      </Link>

      {/* Profile header */}
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-htg-indigo/20 flex items-center justify-center text-2xl font-bold text-htg-indigo">
              {(profile.display_name || profile.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                {roleIcon}
                <h2 className="text-xl font-bold text-htg-fg">{profile.display_name || '—'}</h2>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-htg-fg-muted mt-0.5">
                <Mail className="w-3.5 h-3.5" />
                {profile.email}
              </div>
              {profile.phone && (
                <p className="text-sm text-htg-fg-muted mt-0.5">{profile.phone}</p>
              )}
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  profile.role === 'admin' ? 'bg-htg-warm/20 text-htg-warm' :
                  profile.role === 'moderator' ? 'bg-htg-sage/20 text-htg-sage' :
                  'bg-htg-surface text-htg-fg-muted'
                }`}>
                  {profile.role}
                </span>
                {profile.wix_member_id && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                    WIX migrowany
                  </span>
                )}
                <span className="text-xs text-htg-fg-muted flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Klient od: {new Date((profile as any).wix_created_at ?? profile.created_at).toLocaleDateString('pl')}
                  {(profile as any).wix_created_at && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400">WIX</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-col gap-2 shrink-0">
            <Link
              href={`/konto/admin/podglad?email=${encodeURIComponent(profile.email || '')}`}
              className="flex items-center gap-2 px-4 py-2 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo/90 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Otwórz jako użytkownik
            </Link>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-htg-indigo">{entitlements.length}</p>
          <p className="text-xs text-htg-fg-muted mt-0.5">Dostępy do sesji</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-htg-sage">{upcomingBookings.length}</p>
          <p className="text-xs text-htg-fg-muted mt-0.5">Nadchodzące sesje</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-htg-fg">{pastBookings.length}</p>
          <p className="text-xs text-htg-fg-muted mt-0.5">Odbyté sesje</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-htg-warm">{orders.length}</p>
          <p className="text-xs text-htg-fg-muted mt-0.5">Zamówienia</p>
        </div>
      </div>

      {/* Admin actions — client component */}
      <AdminUserActions
        userId={id}
        userEmail={profile.email || ''}
        initialName={profile.display_name || ''}
        initialPhone={profile.phone || ''}
      />

      {/* Upcoming bookings */}
      {upcomingBookings.length > 0 && (
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-htg-fg mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-htg-sage" />
            Nadchodzące sesje ({upcomingBookings.length})
          </h3>
          <div className="space-y-2">
            {upcomingBookings.map(b => {
              const ps = b.payment_status ? PAYMENT_STATUS_BADGE[b.payment_status] : null;
              const bs = BOOKING_STATUS_LABELS[b.status] || { label: b.status, color: 'text-htg-fg-muted' };
              return (
                <div key={b.id} className="flex items-center justify-between py-2.5 px-3 bg-htg-surface rounded-lg gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-htg-fg">
                        {SESSION_CONFIG[b.session_type as SessionType]?.label || b.session_type}
                      </p>
                      <p className="text-xs text-htg-fg-muted">{getBookingDate(b)} · {getBookingTime(b)?.slice(0,5)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${bs.color}`}>{bs.label}</span>
                    {ps && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ps.className}`}>{ps.label}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entitlements */}
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
        <h3 className="text-base font-semibold text-htg-fg mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-htg-indigo" />
          Dostępy do Biblioteki Sesji ({entitlements.length})
        </h3>
        {entitlements.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Brak zakupionych dostępów</p>
        ) : (
          <div className="space-y-4">
            {sessionEntitlements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">
                  Sesje pojedyncze ({sessionEntitlements.length})
                </p>
                <div className="space-y-1">
                  {sessionEntitlements.map(e => (
                    <div key={e.id} className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg">
                      <span className="text-sm text-htg-fg">Sesja pojedyncza</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-htg-fg-muted">{e.source}</span>
                        <span className="text-xs text-htg-fg-muted">{new Date(e.created_at).toLocaleDateString('pl')}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${e.is_active ? 'bg-green-500/10 text-green-500' : 'bg-htg-surface text-htg-fg-muted'}`}>
                          {e.is_active ? 'aktywny' : 'wygasły'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {monthlyEntitlements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">
                  Pakiety miesięczne ({monthlyEntitlements.length})
                </p>
                <div className="space-y-1">
                  {monthlyEntitlements.map(e => (
                    <div key={e.id} className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg">
                      <span className="text-sm text-htg-fg">Pakiet {e.scope_month}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-htg-fg-muted">{e.source}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${e.is_active ? 'bg-green-500/10 text-green-500' : 'bg-htg-surface text-htg-fg-muted'}`}>
                          {e.is_active ? 'aktywny' : 'wygasły'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {yearlyEntitlements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">
                  Pakiety roczne ({yearlyEntitlements.length})
                </p>
                <div className="space-y-1">
                  {yearlyEntitlements.map(e => (
                    <div key={e.id} className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg">
                      <span className="text-sm text-htg-fg">Pakiet roczny · {e.scope_month}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-htg-fg-muted">{e.source}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${e.is_active ? 'bg-green-500/10 text-green-500' : 'bg-htg-surface text-htg-fg-muted'}`}>
                          {e.is_active ? 'aktywny' : 'wygasły'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Past bookings */}
      {pastBookings.length > 0 && (
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-htg-fg mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-htg-fg-muted" />
            Historia sesji indywidualnych ({pastBookings.length})
          </h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {pastBookings.map(b => {
              const ps = b.payment_status ? PAYMENT_STATUS_BADGE[b.payment_status] : null;
              return (
                <div key={b.id} className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg gap-2 flex-wrap">
                  <div>
                    <p className="text-sm text-htg-fg">{SESSION_CONFIG[b.session_type as SessionType]?.label || b.session_type}</p>
                    <p className="text-xs text-htg-fg-muted">{getBookingDate(b)} · {getBookingTime(b)?.slice(0,5)}</p>
                  </div>
                  {ps && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ps.className}`}>{ps.label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Orders */}
      {orders.length > 0 && (
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-htg-fg mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-htg-warm" />
            Zamówienia ({orders.length})
          </h3>
          <div className="space-y-1">
            {orders.map(o => (
              <div key={o.id} className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg gap-2 flex-wrap">
                <div>
                  <p className="text-sm text-htg-fg">
                    {o.amount_paid != null ? `${(o.amount_paid / 100).toFixed(0)} ${o.currency?.toUpperCase() || 'PLN'}` : '—'}
                  </p>
                  <p className="text-xs text-htg-fg-muted">{o.source} · {o.payment_method || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    o.status === 'paid' ? 'bg-green-500/10 text-green-500' :
                    o.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                    'bg-htg-surface text-htg-fg-muted'
                  }`}>{o.status}</span>
                  <span className="text-xs text-htg-fg-muted">{new Date(o.created_at).toLocaleDateString('pl')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account update requests */}
      {updateRequests.length > 0 && (
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-htg-fg mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-htg-indigo" />
            Zgłoszenia aktualizacji ({updateRequests.length})
          </h3>
          <div className="space-y-2">
            {updateRequests.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg">
                <div>
                  <p className="text-sm text-htg-fg">{r.description}</p>
                  <p className="text-xs text-htg-fg-muted">{r.category} · {new Date(r.created_at).toLocaleDateString('pl')}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  r.status === 'approved' ? 'bg-green-500/10 text-green-500 border-green-500/30' :
                  r.status === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                  'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
                }`}>
                  {r.status === 'approved' ? 'Zaakceptowane' : r.status === 'rejected' ? 'Odrzucone' : 'Oczekujące'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
