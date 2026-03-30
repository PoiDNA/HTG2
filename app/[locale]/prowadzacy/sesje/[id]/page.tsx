import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n-config';
import { ArrowLeft, Calendar, Clock, User, Mail, FileText, CreditCard, History } from 'lucide-react';
import PaymentStatusBadge from '@/components/staff/PaymentStatusBadge';
import { PAYMENT_STATUS_LABELS } from '@/lib/booking/constants';

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid:       { label: PAYMENT_STATUS_LABELS.confirmed_paid,       className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  installments:         { label: PAYMENT_STATUS_LABELS.installments,         className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  partial_payment:      { label: PAYMENT_STATUS_LABELS.partial_payment,      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  pending_verification: { label: PAYMENT_STATUS_LABELS.pending_verification, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};
import PaymentCommentEditor from './PaymentCommentEditor';
import SessionTypeSelector from './SessionTypeSelector';
import ClientNameEditor from './ClientNameEditor';
import DeleteSessionButton from './DeleteSessionButton';
import BookingUserEditor from './BookingUserEditor';
import SessionTimeEditor from './SessionTimeEditor';
import SessionDateEditor from './SessionDateEditor';

import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { staffMember, user: authUser } = await getEffectiveStaffMember();
  const admin = createSupabaseServiceRole();

  const isPractitioner = staffMember?.role === 'practitioner';

  // Check admin: use staffMember.user_id when impersonating, otherwise the actual logged-in user
  let isAdmin = false;
  const profileUserId = staffMember?.user_id ?? authUser?.id;
  if (profileUserId) {
    const { data: profile } = await admin.from('profiles').select('role').eq('id', profileUserId).single();
    isAdmin = profile?.role === 'admin';
  }
  const canEditPayment = isPractitioner || isAdmin;

  // Fetch booking
  const { data: booking } = await admin
    .from('bookings')
    .select(`
      id, session_type, status, topics, user_id, payment_status, payment_comment, created_at,
      slot:booking_slots(slot_date, start_time, end_time)
    `)
    .eq('id', id)
    .single();

  if (!booking) {
    return (
      <div className="p-8">
        <Link href="/prowadzacy/sesje" className="text-htg-fg-muted hover:text-htg-fg text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Wróć
        </Link>
        <p className="text-htg-fg-muted">Sesja nie znaleziona.</p>
      </div>
    );
  }

  // Fetch client profile
  const { data: clientProfile } = await admin
    .from('profiles')
    .select('id, email, display_name')
    .eq('id', booking.user_id)
    .single();

  // Fetch client session history
  const { data: clientHistory } = await admin
    .from('bookings')
    .select(`
      id, session_type, status, payment_status, created_at,
      slot:booking_slots(slot_date, start_time, end_time)
    `)
    .eq('user_id', booking.user_id)
    .in('status', ['confirmed', 'completed', 'pending_confirmation'])
    .order('created_at', { ascending: false })
    .limit(50);

  const slot = Array.isArray(booking.slot) ? booking.slot[0] : booking.slot;
  const ps = PAYMENT_STATUS_BADGE[booking.payment_status] || PAYMENT_STATUS_BADGE.pending_verification;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <Link href="/prowadzacy/sesje" className="text-htg-fg-muted hover:text-htg-fg text-sm flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Wróć do listy sesji
      </Link>

      {/* Session info */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
        <h1 className="text-xl font-serif font-bold text-htg-fg">
          {SESSION_CONFIG[booking.session_type as SessionType]?.label || booking.session_type}
        </h1>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <Calendar className="w-4 h-4" />
            {isAdmin ? (
              <SessionDateEditor
                bookingId={booking.id}
                initialDate={slot?.slot_date || ''}
              />
            ) : (
              <span className="text-htg-fg font-medium">{slot?.slot_date || '—'}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <Clock className="w-4 h-4" />
            {isAdmin ? (
              <SessionTimeEditor
                bookingId={booking.id}
                initialTime={slot?.start_time?.slice(0, 5) || '09:00'}
              />
            ) : (
              <span className="text-htg-fg">{slot?.start_time?.slice(0, 5)}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <User className="w-4 h-4" />
            <ClientNameEditor
              userId={booking.user_id}
              initialName={clientProfile?.display_name || ''}
            />
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <Mail className="w-4 h-4" />
            {isAdmin ? (
              <BookingUserEditor
                bookingId={booking.id}
                currentUserId={booking.user_id}
                currentEmail={clientProfile?.email || '—'}
              />
            ) : (
              <span>{clientProfile?.email || '—'}</span>
            )}
          </div>
        </div>

        {/* Payment status */}
        <div className="flex items-center gap-3">
          <CreditCard className="w-4 h-4 text-htg-fg-muted" />
          <span className="text-sm text-htg-fg-muted">Płatność:</span>
          <PaymentStatusBadge
            bookingId={booking.id}
            initialStatus={booking.payment_status || 'pending_verification'}
            canEdit={canEditPayment}
          />
        </div>
      </div>

      {/* Session type selector — practitioner or admin */}
      {canEditPayment && ['natalia_asysta', 'natalia_agata', 'natalia_justyna'].includes(booking.session_type) && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-3">
          <h2 className="text-base font-serif font-bold text-htg-fg">Typ sesji / Przypisanie asystentki</h2>
          <SessionTypeSelector bookingId={booking.id} initialType={booking.session_type} />
        </div>
      )}

      {/* Topics */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="text-base font-serif font-bold text-htg-fg mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-htg-sage" />
          Zagadnienia na sesję
        </h2>
        {booking.topics ? (
          <p className="text-sm text-htg-fg whitespace-pre-wrap">{booking.topics}</p>
        ) : (
          <p className="text-sm text-htg-fg-muted italic">Klient nie wpisał jeszcze zagadnień.</p>
        )}
      </div>

      {/* Payment comment — practitioner or admin */}
      {canEditPayment && (
        <PaymentCommentEditor
          bookingId={booking.id}
          initialComment={booking.payment_comment || ''}
        />
      )}

      {/* Delete session — strict admin only (not practitioner/assistants) */}
      {isAdmin && !isPractitioner && (
        <DeleteSessionButton bookingId={booking.id} locale={locale} />
      )}

      {/* Client session history */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="text-base font-serif font-bold text-htg-fg mb-3 flex items-center gap-2">
          <History className="w-4 h-4 text-htg-indigo" />
          Historia sesji klienta ({clientHistory?.length || 0})
        </h2>

        {!clientHistory || clientHistory.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Brak historii sesji.</p>
        ) : (
          <div className="space-y-2">
            {clientHistory.map((h: any) => {
              const hSlot = Array.isArray(h.slot) ? h.slot[0] : h.slot;
              const isCurrent = h.id === id;
              const hPs = PAYMENT_STATUS_BADGE[h.payment_status] || PAYMENT_STATUS_BADGE.pending_verification;
              return (
                <div
                  key={h.id}
                  className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                    isCurrent ? 'bg-htg-sage/10 border border-htg-sage/30' : 'hover:bg-htg-surface/50'
                  }`}
                >
                  <span className="text-htg-fg-muted w-24 shrink-0">{hSlot?.slot_date || '—'}</span>
                  <span className="text-htg-fg w-14 shrink-0">{hSlot?.start_time?.slice(0,5) || ''}</span>
                  <span className="text-xs text-htg-fg-muted flex-1">{SESSION_CONFIG[h.session_type as SessionType]?.labelShort || h.session_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${hPs.className}`}>{hPs.label}</span>
                  {isCurrent && <span className="text-xs text-htg-sage font-bold">← ta sesja</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
