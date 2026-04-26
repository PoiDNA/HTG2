import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { canEditSesje } from '@/lib/staff-config';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n-config';
import { Link } from '@/i18n-config';
import { ArrowLeft, Calendar, Clock, User, Mail, FileText, CreditCard, History, ExternalLink, Banknote, Download } from 'lucide-react';
import PaymentStatusBadge from '@/components/staff/PaymentStatusBadge';
import { PAYMENT_STATUS_LABELS, SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

import PaymentCommentEditor from '@/app/[locale]/prowadzacy/sesje/[id]/PaymentCommentEditor';
import SessionTypeSelector from '@/app/[locale]/prowadzacy/sesje/[id]/SessionTypeSelector';
import ClientNameEditor from '@/app/[locale]/prowadzacy/sesje/[id]/ClientNameEditor';
import DeleteSessionButton from '@/app/[locale]/prowadzacy/sesje/[id]/DeleteSessionButton';
import BookingUserEditor from '@/app/[locale]/prowadzacy/sesje/[id]/BookingUserEditor';
import SessionTimeEditor from '@/app/[locale]/prowadzacy/sesje/[id]/SessionTimeEditor';
import SessionDateEditor from '@/app/[locale]/prowadzacy/sesje/[id]/SessionDateEditor';
import OperatorReassignSelector from '@/components/staff/OperatorReassignSelector';

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid:       { label: PAYMENT_STATUS_LABELS.confirmed_paid,       className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  installments:         { label: PAYMENT_STATUS_LABELS.installments,         className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  partial_payment:      { label: PAYMENT_STATUS_LABELS.partial_payment,      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  pending_verification: { label: PAYMENT_STATUS_LABELS.pending_verification, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

export default async function AdminSessionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // Admin auth
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return redirect({href: '/konto', locale});
  const isAdmin = isAdminEmail(user.email ?? '');
  if (!isAdmin && !canEditSesje(user.email)) return redirect({href: '/konto', locale});

  const db = createSupabaseServiceRole();

  // Fetch booking
  const { data: booking } = await db
    .from('bookings')
    .select(`
      id, session_type, status, topics, user_id, payment_status, payment_comment, created_at, transfer_proof_url, transfer_proof_filename,
      slot:booking_slots(slot_date, start_time, end_time, assistant_id)
    `)
    .eq('id', id)
    .single();

  if (!booking) {
    return (
      <div className="p-8">
        <Link href="/konto/admin/sesje" className="text-htg-fg-muted hover:text-htg-fg text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Wróć
        </Link>
        <p className="text-htg-fg-muted">Sesja nie znaleziona.</p>
      </div>
    );
  }

  // Client profile
  const { data: clientProfile } = await db
    .from('profiles')
    .select('id, email, display_name')
    .eq('id', booking.user_id)
    .single();

  // Client history
  const { data: clientHistory } = await db
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

  // Fetch operators (assistants) for reassign dropdown (only when session has operator)
  const sessionHasOperator = ['natalia_asysta', 'natalia_agata', 'natalia_justyna'].includes(booking.session_type);
  let operators: Array<{ id: string; name: string; slug: string }> = [];
  if (sessionHasOperator) {
    const { data: ops } = await db
      .from('staff_members')
      .select('id, name, slug, role, is_active')
      .in('role', ['assistant', 'operator'])
      .eq('is_active', true)
      .order('name');
    operators = (ops || []).map((o: any) => ({ id: o.id, name: o.name, slug: o.slug }));
  }

  // Generate signed URL for transfer proof (if exists)
  let transferProofSignedUrl: string | null = null;
  if (booking.transfer_proof_url) {
    const { data: signedData } = await db.storage
      .from('transfer-proofs')
      .createSignedUrl(booking.transfer_proof_url, 3600);
    transferProofSignedUrl = signedData?.signedUrl || null;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back — to admin sessions */}
      <Link href="/konto/admin/sesje" className="text-htg-fg-muted hover:text-htg-fg text-sm flex items-center gap-1">
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
            <SessionDateEditor bookingId={booking.id} initialDate={slot?.slot_date || ''} />
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <Clock className="w-4 h-4" />
            <SessionTimeEditor bookingId={booking.id} initialTime={slot?.start_time?.slice(0, 5) || '09:00'} />
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <User className="w-4 h-4" />
            <ClientNameEditor userId={booking.user_id} initialName={clientProfile?.display_name || ''} />
            <Link
              href={{pathname: '/konto/admin/uzytkownicy/[id]', params: {id: booking.user_id}}}
              className="text-htg-indigo hover:text-htg-indigo/70 transition-colors"
              title="Profil użytkownika"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <Mail className="w-4 h-4" />
            <BookingUserEditor
              bookingId={booking.id}
              currentUserId={booking.user_id}
              currentEmail={clientProfile?.email || '—'}
            />
          </div>
        </div>

        {/* Payment */}
        <div className="flex items-center gap-3">
          <CreditCard className="w-4 h-4 text-htg-fg-muted" />
          <span className="text-sm text-htg-fg-muted">Płatność:</span>
          <PaymentStatusBadge
            bookingId={booking.id}
            initialStatus={booking.payment_status || 'pending_verification'}
            canEdit={true}
          />
        </div>

        {/* Transfer proof */}
        {booking.transfer_proof_url && (
          <div className="flex items-center gap-3 pt-2 border-t border-htg-card-border">
            <Banknote className="w-4 h-4 text-htg-fg-muted" />
            <span className="text-sm text-htg-fg-muted">Dowód przelewu:</span>
            {transferProofSignedUrl ? (
              <a
                href={transferProofSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-htg-indigo hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                {booking.transfer_proof_filename || 'Pobierz dowód'}
              </a>
            ) : (
              <span className="text-sm text-htg-fg-muted">Plik niedostępny</span>
            )}
          </div>
        )}
      </div>

      {/* Session type selector */}
      {['natalia_asysta', 'natalia_agata', 'natalia_justyna', 'natalia_solo'].includes(booking.session_type) && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-3">
          <h2 className="text-base font-serif font-bold text-htg-fg">Typ sesji / Przypisanie asystentki</h2>
          <SessionTypeSelector bookingId={booking.id} initialType={booking.session_type} />
        </div>
      )}

      {/* Operator reassign (post-hoc) — only when session has an operator */}
      {sessionHasOperator && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
          <OperatorReassignSelector
            bookingId={booking.id}
            currentAssistantId={slot?.assistant_id ?? null}
            operators={operators}
          />
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

      {/* Payment comment */}
      <PaymentCommentEditor bookingId={booking.id} initialComment={booking.payment_comment || ''} />

      {/* Delete — admin only */}
      {isAdmin && <DeleteSessionButton bookingId={booking.id} locale={locale} />}

      {/* Client history */}
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
                <Link
                  key={h.id}
                  href={{pathname: '/konto/admin/sesje/[id]', params: {id: h.id}}}
                  className={`flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${
                    isCurrent ? 'bg-htg-sage/10 border border-htg-sage/30' : 'hover:bg-htg-surface/50'
                  }`}
                >
                  <span className="text-htg-fg-muted w-24 shrink-0">{hSlot?.slot_date || '—'}</span>
                  <span className="text-htg-fg w-14 shrink-0">{hSlot?.start_time?.slice(0, 5) || ''}</span>
                  <span className="text-xs text-htg-fg-muted flex-1">{SESSION_CONFIG[h.session_type as SessionType]?.labelShort || h.session_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${hPs.className}`}>{hPs.label}</span>
                  {isCurrent && <span className="text-xs text-htg-sage font-bold">← ta sesja</span>}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
