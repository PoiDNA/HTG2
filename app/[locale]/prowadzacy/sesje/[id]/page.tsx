'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, User, Mail, FileText, CreditCard, MessageSquare, History } from 'lucide-react';

const SESSION_LABELS: Record<string, string> = {
  natalia_solo: 'Sesja 1:1 z Natalią',
  natalia_agata: 'Sesja z Natalią i Agatą',
  natalia_justyna: 'Sesja z Natalią i Justyną',
  natalia_para: 'Sesja dla par',
  natalia_asysta: 'Sesja z Asystą',
};

const PAYMENT_OPTIONS = [
  { value: 'confirmed_paid', label: 'Opłacona', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'installments', label: 'Raty', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'pending_verification', label: 'Do potwierdzenia', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
];

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [clientHistory, setClientHistory] = useState<any[]>([]);
  const [staffRole, setStaffRole] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentComment, setPaymentComment] = useState('');

  const isAdminOrPractitioner = staffRole === 'practitioner' || ['admin', 'moderator'].includes(userRole);

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get current user's profile and staff info
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setUserRole(profile.role);

      const { data: staff } = await supabase.from('staff_members').select('role').eq('user_id', user.id).eq('is_active', true).maybeSingle();
      if (staff) setStaffRole(staff.role);

      // Fetch booking
      const { data: b } = await supabase
        .from('bookings')
        .select(`
          id, session_type, status, topics, user_id, payment_status, payment_comment, created_at,
          slot:booking_slots(slot_date, start_time, end_time)
        `)
        .eq('id', bookingId)
        .single();

      if (!b) { setLoading(false); return; }

      setBooking(b);
      setPaymentStatus(b.payment_status || 'pending_verification');
      setPaymentComment(b.payment_comment || '');

      // Fetch client profile
      const { data: clientProfile } = await supabase.from('profiles').select('id, email, display_name').eq('id', b.user_id).single();
      setClient(clientProfile);

      // Fetch client session history
      const { data: history } = await supabase
        .from('bookings')
        .select(`
          id, session_type, status, payment_status, created_at,
          slot:booking_slots(slot_date, start_time, end_time)
        `)
        .eq('user_id', b.user_id)
        .in('status', ['confirmed', 'completed', 'pending_confirmation'])
        .order('created_at', { ascending: false })
        .limit(50);

      setClientHistory(history || []);
      setLoading(false);
    }
    load();
  }, [bookingId]);

  async function savePayment() {
    setSaving(true);
    await fetch(`/api/booking/${bookingId}/payment-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: paymentStatus, payment_comment: paymentComment }),
    });
    setSaving(false);
    // Update local state
    setBooking((prev: any) => ({ ...prev, payment_status: paymentStatus, payment_comment: paymentComment }));
  }

  if (loading) return <div className="text-htg-fg-muted p-8">Ładowanie...</div>;
  if (!booking) return <div className="text-htg-fg-muted p-8">Sesja nie znaleziona.</div>;

  const slot = Array.isArray(booking.slot) ? booking.slot[0] : booking.slot;
  const ps = PAYMENT_OPTIONS.find(p => p.value === booking.payment_status) || PAYMENT_OPTIONS[2];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <button onClick={() => router.back()} className="text-htg-fg-muted hover:text-htg-fg text-sm flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Wróć
      </button>

      {/* Session info */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
        <h1 className="text-xl font-serif font-bold text-htg-fg">
          {SESSION_LABELS[booking.session_type] || booking.session_type}
        </h1>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <Calendar className="w-4 h-4" />
            <span>{slot?.slot_date || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <Clock className="w-4 h-4" />
            <span>{slot?.start_time?.slice(0,5)}–{slot?.end_time?.slice(0,5)}</span>
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <User className="w-4 h-4" />
            <span className="text-htg-fg font-medium">{client?.display_name || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-htg-fg-muted">
            <Mail className="w-4 h-4" />
            <span>{client?.email || '—'}</span>
          </div>
        </div>

        {/* Payment status badge */}
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-htg-fg-muted" />
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${ps.className}`}>
            {ps.label}
          </span>
        </div>
      </div>

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

      {/* Payment management — admin/practitioner only */}
      {isAdminOrPractitioner && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
          <h2 className="text-base font-serif font-bold text-htg-fg flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-htg-warm" />
            Status płatności
          </h2>

          <div className="flex gap-2 flex-wrap">
            {PAYMENT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPaymentStatus(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${
                  paymentStatus === opt.value
                    ? opt.className + ' border-current ring-2 ring-current/20'
                    : 'bg-htg-surface text-htg-fg-muted border-htg-card-border hover:bg-htg-surface/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs text-htg-fg-muted flex items-center gap-1 mb-1">
              <MessageSquare className="w-3 h-3" />
              Komentarz (widoczny tylko dla Natalii i Admina)
            </label>
            <textarea
              value={paymentComment}
              onChange={e => setPaymentComment(e.target.value)}
              className="w-full bg-htg-surface border border-htg-card-border rounded-lg p-3 text-sm text-htg-fg placeholder-htg-fg-muted resize-none"
              rows={2}
              placeholder="Notatka o płatności..."
            />
          </div>

          <button
            onClick={savePayment}
            disabled={saving}
            className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
          </button>
        </div>
      )}

      {/* Client session history */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="text-base font-serif font-bold text-htg-fg mb-3 flex items-center gap-2">
          <History className="w-4 h-4 text-htg-indigo" />
          Historia sesji klienta ({clientHistory.length})
        </h2>

        {clientHistory.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Brak historii sesji.</p>
        ) : (
          <div className="space-y-2">
            {clientHistory.map((h: any) => {
              const hSlot = Array.isArray(h.slot) ? h.slot[0] : h.slot;
              const isCurrent = h.id === bookingId;
              const hPs = PAYMENT_OPTIONS.find(p => p.value === h.payment_status) || PAYMENT_OPTIONS[2];
              return (
                <div
                  key={h.id}
                  className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                    isCurrent ? 'bg-htg-sage/10 border border-htg-sage/30' : 'hover:bg-htg-surface/50'
                  }`}
                >
                  <span className="text-htg-fg-muted w-24 shrink-0">{hSlot?.slot_date || '—'}</span>
                  <span className="text-htg-fg w-14 shrink-0">{hSlot?.start_time?.slice(0,5) || ''}</span>
                  <span className="text-xs text-htg-fg-muted flex-1">{SESSION_LABELS[h.session_type] || h.session_type}</span>
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
