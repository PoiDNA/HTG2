'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n-config';
import { PRODUCT_SLUGS, SESSION_CONFIG } from '@/lib/booking/constants';
import { formatPrice, getIntlLocale } from '@/lib/format';
import { User, Users, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Zap, Heart, Gift, Upload, X, Banknote } from 'lucide-react';
import BankTransferCard from '@/components/booking/BankTransferCard';

interface SessionOption {
  slug: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  priceId: string;
  sessionType: string;
}

interface SlotInfo {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  status: string;
}

interface SessionPickerProps {
  sessions: SessionOption[];
  userEmail?: string;
  labels: {
    choose: string;
    date_label: string;
    date_hint: string;
    topics_label: string;
    topics_placeholder: string;
    buy: string;
    cancel_policy: string;
    per_session: string;
  };
}

function getLocalizedDays(locale: string): string[] {
  const intlLocale = getIntlLocale(locale);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, i); // Jan 2024 starts on Monday (0=Sun in JS)
    return d.toLocaleDateString(intlLocale, { weekday: 'short' });
  });
}

function getLocalizedMonths(locale: string): string[] {
  const intlLocale = getIntlLocale(locale);
  return Array.from({ length: 12 }, (_, i) =>
    new Date(2024, i, 1).toLocaleDateString(intlLocale, { month: 'long' })
  );
}

export function SessionPicker({ sessions, userEmail, labels }: SessionPickerProps) {
  const locale = useLocale();
  const ti = useTranslations('Individual');
  // 'solo' | 'asysta' | 'para' | null
  const [selectedGroup, setSelectedGroup] = useState<'solo' | 'asysta' | 'para' | null>(null);
  // slug of chosen assistant session (sesja-natalia-agata or sesja-natalia-justyna)
  const [selectedAssistant, setSelectedAssistant] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [loading, setLoading] = useState(false);
  const [wantAcceleration, setWantAcceleration] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'full' | 'installments'>('full');
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'transfer'>('stripe');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isGift, setIsGift] = useState(false);
  const [giftEmail, setGiftEmail] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const router = useRouter();

  // Fetch user email client-side if not provided via prop
  useEffect(() => {
    if (userEmail) { setClientEmail(userEmail); return; }
    (async () => {
      try {
        const { createSupabaseBrowser } = await import('@/lib/supabase/client');
        const supabase = createSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setClientEmail(user.email);
      } catch { /* not logged in */ }
    })();
  }, [userEmail]);

  // Derive sessions
  const soloSession = sessions.find(s => s.sessionType === 'natalia_solo');
  const assistantSessions = sessions.filter(
    s => s.sessionType === 'natalia_agata' || s.sessionType === 'natalia_justyna'
  );
  const paraSession = sessions.find(s => s.sessionType === 'natalia_para') ?? {
    slug: PRODUCT_SLUGS.SESSION_PARA,
    name: SESSION_CONFIG.natalia_para.label,
    description: 'Sesja dla dwóch osób z Natalią',
    amount: 160000,
    currency: 'pln',
    priceId: '',
    sessionType: 'natalia_para',
  };
  // Representative assistant price (same for both)
  const assistantPrice = assistantSessions[0]?.amount ?? 0;

  // The active session that determines slot fetching / checkout
  const selectedSession = useMemo(() => {
    if (selectedGroup === 'solo') return soloSession ?? null;
    if (selectedGroup === 'asysta' && selectedAssistant)
      return assistantSessions.find(s => s.slug === selectedAssistant) ?? null;
    if (selectedGroup === 'para') return paraSession;
    return null;
  }, [selectedGroup, selectedAssistant, soloSession, assistantSessions, paraSession]);

  // Load available slots when session type changes
  useEffect(() => {
    if (!selectedSession) { setSlots([]); setSelectedSlotId(null); return; }

    setLoadingSlots(true);
    const now = new Date();
    const monthPromises = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthPromises.push(fetch(`/api/booking/slots?month=${m}`).then(r => r.json()));
    }

    Promise.all(monthPromises)
      .then(results => {
        const allSlots: SlotInfo[] = [];
        for (const data of results) {
          if (data.slots) {
            for (const dateSlots of Object.values(data.slots)) {
              for (const slot of dateSlots as SlotInfo[]) {
                if (
                  slot.session_type === selectedSession.sessionType ||
                  slot.session_type === 'natalia_solo'
                ) {
                  allSlots.push(slot);
                }
              }
            }
          }
        }
        allSlots.sort((a, b) => {
          const cmp = a.slot_date.localeCompare(b.slot_date);
          return cmp !== 0 ? cmp : a.start_time.localeCompare(b.start_time);
        });
        const seen = new Set<string>();
        setSlots(allSlots.filter(s => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        }));
        setSelectedSlotId(null);
        setLoadingSlots(false);
      })
      .catch(() => setLoadingSlots(false));
  }, [selectedSession?.sessionType]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, SlotInfo[]>();
    slots.forEach(s => {
      const existing = map.get(s.slot_date) || [];
      existing.push(s);
      map.set(s.slot_date, existing);
    });
    return map;
  }, [slots]);

  const earliestSlot = slots.length > 0 ? slots[0] : null;
  const selectedSlot = slots.find(s => s.id === selectedSlotId);

  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [calendarMonth]);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    const days = getLocalizedDays(locale);
    return `${days[d.getDay()]} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  function dateKey(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const totalAmount = selectedSession ? selectedSession.amount / 100 : 0;
  const currencyCode = (selectedSession?.currency || 'pln').toUpperCase();
  const isWithAssistant = selectedSession?.sessionType === 'natalia_agata' || selectedSession?.sessionType === 'natalia_justyna';
  const isPara = selectedSession?.sessionType === 'natalia_para';
  const installmentsCount = isWithAssistant || isPara ? 4 : 3;
  const installmentAmount = 400;
  const payAmount = paymentMode === 'full' ? totalAmount : installmentAmount;

  async function handleCheckout() {
    if (!selectedSession || payAmount <= 0) return;
    if (!recordingConsent) return;

    // Bank transfer flow
    if (paymentMethod === 'transfer' && paymentMode === 'full') {
      if (!proofFile) return;
      if (!selectedSlotId) return;
      setLoading(true);
      try {
        const { createSupabaseBrowser } = await import('@/lib/supabase/client');
        const supabase = createSupabaseBrowser();
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) { router.push('/login' as any); return; }

        // Record consent
        try {
          await supabase.from('consent_records').insert({
            user_id: currentUser.id,
            consent_type: 'recording_publication',
            granted: true,
            consent_text: 'Rozumiem, że sesja jest nagrywana i może zostać opublikowana po montażu. Mogę wskazać fragmenty do usunięcia w ciągu 7 dni od udostępnienia nagrania.',
          });
        } catch { /* Non-blocking */ }

        // Upload proof to Supabase Storage
        const ext = proofFile.name.split('.').pop() || 'bin';
        const proofPath = `${currentUser.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('transfer-proofs')
          .upload(proofPath, proofFile);
        if (uploadError) throw uploadError;

        // Reserve slot with transfer proof
        const res = await fetch('/api/booking/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slotId: selectedSlotId,
            sessionType: selectedSession.sessionType,
            paymentMethod: 'transfer',
            proofPath,
            proofFilename: proofFile.name,
            ...(isGift && giftEmail && { giftEmail: giftEmail.trim().toLowerCase() }),
            ...(isGift && giftMessage.trim() && { giftMessage: giftMessage.trim() }),
          }),
        });
        const data = await res.json();
        if (res.status === 401) { router.push('/login' as any); return; }
        if (data.success) {
          router.push('/konto/sesje-indywidualne?transfer=success' as any);
        } else {
          alert(data.error || 'Błąd rezerwacji');
        }
      } catch (err) {
        console.error('Bank transfer booking error:', err);
        alert('Wystąpił błąd. Spróbuj ponownie.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Stripe flow (existing)
    if (!selectedSession.priceId) return;
    setLoading(true);
    try {
      // Record recording/publication consent
      const { createSupabaseBrowser } = await import('@/lib/supabase/client');
      const supabase = createSupabaseBrowser();
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        try {
          await supabase.from('consent_records').insert({
            user_id: currentUser.id,
            consent_type: 'recording_publication',
            granted: true,
            consent_text: 'Rozumiem, że sesja jest nagrywana i może zostać opublikowana po montażu. Mogę wskazać fragmenty do usunięcia w ciągu 7 dni od udostępnienia nagrania.',
          });
        } catch { /* Non-blocking */ }
      }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: selectedSession.priceId,
          mode: 'payment',
          locale,
          ...(paymentMode !== 'full' && { amountOverride: payAmount * 100 }),
          metadata: {
            type: 'individual',
            session_type: selectedSession.sessionType,
            slot_id: selectedSlotId || '',
            want_acceleration: wantAcceleration ? 'true' : 'false',
            payment_mode: paymentMode,
            total_amount: String(totalAmount * 100),
            installment_number: paymentMode === 'installments' ? '1' : undefined,
            installments_total: paymentMode === 'installments' ? String(installmentsCount) : undefined,
            ...(isGift && giftEmail && { gift_for_email: giftEmail.trim().toLowerCase() }),
            ...(isGift && giftMessage.trim() && { gift_message: giftMessage.trim() }),
          },
        }),
      });
      const data = await res.json();
      if (res.status === 401) { router.push('/login' as any); return; }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setLoading(false);
    }
  }

  function selectGroup(group: 'solo' | 'asysta' | 'para') {
    setSelectedGroup(group);
    setSelectedAssistant(null);
    setSelectedSlotId(null);
    setCalendarOpen(false);
    setWantAcceleration(false);
    setPaymentMode('full');
    setPaymentMethod('stripe');
    setProofFile(null);
  }

  function selectAssistant(slug: string) {
    setSelectedAssistant(slug);
    setSelectedSlotId(null);
    setCalendarOpen(false);
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Choose session type */}
      <h2 className="font-serif font-semibold text-xl text-htg-fg">{labels.choose}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sesja 1:1 z Natalią */}
        {soloSession && (
          <button
            onClick={() => selectGroup('solo')}
            className={`relative text-left p-6 rounded-xl border-2 transition-all ${
              selectedGroup === 'solo'
                ? 'border-htg-sage bg-htg-sage/5 ring-2 ring-htg-sage/20'
                : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
            }`}
          >
            {selectedGroup === 'solo' && (
              <div className="absolute top-3 right-3 w-6 h-6 bg-htg-sage rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            <User className={`w-8 h-8 mb-3 ${selectedGroup === 'solo' ? 'text-htg-sage' : 'text-htg-fg-muted'}`} />
            <h3 className="font-serif font-semibold text-htg-fg mb-1">{ti('session_solo_name')}</h3>
            <p className="text-xs text-htg-fg-muted mb-4">{ti('session_solo_subtitle')}</p>
            <p className="text-2xl font-bold text-htg-fg">
              {formatPrice(soloSession.amount, soloSession.currency, locale)}
            </p>
            <p className="text-xs text-htg-fg-muted">{labels.per_session}</p>
          </button>
        )}

        {/* Sesja z Asystą */}
        {assistantSessions.length > 0 && (
          <div
            className={`relative text-left p-6 rounded-xl border-2 transition-all cursor-pointer ${
              selectedGroup === 'asysta'
                ? 'border-htg-sage bg-htg-sage/5 ring-2 ring-htg-sage/20'
                : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
            }`}
            onClick={() => selectGroup('asysta')}
          >
            {selectedGroup === 'asysta' && selectedAssistant && (
              <div className="absolute top-3 right-3 w-6 h-6 bg-htg-sage rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            <Users className={`w-8 h-8 mb-3 ${selectedGroup === 'asysta' ? 'text-htg-sage' : 'text-htg-fg-muted'}`} />
            <h3 className="font-serif font-semibold text-htg-fg mb-1">{ti('session_with_interpreter_name')}</h3>
            <p className="text-xs text-htg-fg-muted mb-4">{ti('session_with_interpreter_subtitle')}</p>
            <p className="text-2xl font-bold text-htg-fg">
              {formatPrice(assistantPrice, assistantSessions[0]?.currency || 'pln', locale)}
            </p>
            <p className="text-xs text-htg-fg-muted mb-4">{labels.per_session}</p>

            {/* Assistant sub-picker — shown when this group is selected */}
            {selectedGroup === 'asysta' && (
              <div
                className="mt-4 pt-4 border-t border-htg-card-border space-y-2"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-xs font-medium text-htg-fg-muted mb-2">{locale === 'pl' ? ti('choose_assistant') : ti('session_with_interpreter_subtitle')}</p>
                <div className="flex gap-2">
                  {assistantSessions.map(a => {
                    const assistantName = a.sessionType === 'natalia_agata' ? 'Agata' : 'Justyna';
                    const isActive = selectedAssistant === a.slug;
                    return (
                      <button
                        key={a.slug}
                        onClick={() => selectAssistant(a.slug)}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                          isActive
                            ? 'border-htg-sage bg-htg-sage text-white'
                            : 'border-htg-card-border text-htg-fg hover:border-htg-sage/60'
                        }`}
                      >
                        {assistantName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sesja dla par */}
        <button
          onClick={() => selectGroup('para')}
          className={`relative text-left p-6 rounded-xl border-2 transition-all ${
            selectedGroup === 'para'
              ? 'border-rose-500/70 bg-rose-500/5 ring-2 ring-rose-500/20'
              : 'border-htg-card-border bg-htg-card hover:border-rose-500/30'
          }`}
        >
          {selectedGroup === 'para' && (
            <div className="absolute top-3 right-3 w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
          )}
          <Heart className={`w-8 h-8 mb-3 ${selectedGroup === 'para' ? 'text-rose-400' : 'text-htg-fg-muted'}`} />
          <h3 className="font-serif font-semibold text-htg-fg mb-1">{ti('session_pair_name')}</h3>
          <p className="text-xs text-htg-fg-muted mb-4">{ti('session_pair_subtitle')} · 120 min</p>
          <p className="text-2xl font-bold text-htg-fg">
            {formatPrice(paraSession.amount, paraSession.currency, locale)}
          </p>
          <p className="text-xs text-htg-fg-muted">{labels.per_session}</p>
        </button>
      </div>

      {/* Step 2: Slot + payment — shown only when session is fully selected */}
      {selectedSession && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

          {/* Slot selector */}
          <div>
            <span className="flex items-center gap-2 text-sm font-medium text-htg-fg mb-3">
              <Calendar className="w-4 h-4 text-htg-sage" />
              Wybierz termin
            </span>

            {loadingSlots ? (
              <div className="text-htg-fg-muted text-sm py-4 text-center">Ładowanie dostępnych terminów...</div>
            ) : slots.length === 0 ? (
              <div className="bg-htg-surface rounded-xl p-5 text-center">
                <p className="text-htg-fg-muted text-sm mb-3">Brak dostępnych terminów dla tego typu sesji.</p>
                <label className="flex items-center gap-2 justify-center text-sm text-htg-fg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wantAcceleration}
                    onChange={e => setWantAcceleration(e.target.checked)}
                    className="rounded border-htg-card-border"
                  />
                  <Zap className="w-4 h-4 text-htg-warm" />
                  Chcę przyspieszenie — powiadom mnie gdy pojawi się termin
                </label>
              </div>
            ) : (
              <>
                {/* Earliest available */}
                {earliestSlot && !selectedSlotId && (
                  <button
                    onClick={() => setSelectedSlotId(earliestSlot.id)}
                    className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-htg-sage/30 bg-htg-sage/5 hover:bg-htg-sage/10 transition-colors mb-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-htg-sage/20 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-htg-sage" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-htg-fg">Najwcześniejszy termin</p>
                        <p className="text-htg-sage font-bold">
                          {formatDate(earliestSlot.slot_date)} · {earliestSlot.start_time.slice(0, 5)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-htg-sage font-medium px-3 py-1 bg-htg-sage/20 rounded-full">Wybierz</span>
                  </button>
                )}

                {/* Selected slot */}
                {selectedSlotId && selectedSlot && (
                  <div className="flex items-center justify-between p-4 rounded-xl border-2 border-htg-sage bg-htg-sage/10 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-htg-sage flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-htg-fg">Wybrany termin</p>
                        <p className="text-htg-sage font-bold">
                          {formatDate(selectedSlot.slot_date)} · {selectedSlot.start_time.slice(0, 5)}–{selectedSlot.end_time.slice(0, 5)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedSlotId(null); setCalendarOpen(true); }}
                      className="text-xs text-htg-fg-muted hover:text-htg-fg transition-colors"
                    >
                      Zmień
                    </button>
                  </div>
                )}

                {/* Calendar toggle */}
                <button
                  onClick={() => setCalendarOpen(!calendarOpen)}
                  className="flex items-center gap-2 text-sm text-htg-sage hover:text-htg-sage-dark transition-colors"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${calendarOpen ? 'rotate-180' : ''}`} />
                  {calendarOpen ? 'Zwiń kalendarz' : 'Pokaż wszystkie dostępne terminy'}
                </button>

                {/* Calendar grid */}
                {calendarOpen && (
                  <div className="mt-4 bg-htg-surface rounded-xl p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() => setCalendarMonth(prev => {
                          const d = new Date(prev.year, prev.month - 1);
                          return { year: d.getFullYear(), month: d.getMonth() };
                        })}
                        className="p-1 rounded hover:bg-htg-card transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5 text-htg-fg-muted" />
                      </button>
                      <h3 className="font-serif font-bold text-htg-fg">
                        {getLocalizedMonths(locale)[calendarMonth.month]} {calendarMonth.year}
                      </h3>
                      <button
                        onClick={() => setCalendarMonth(prev => {
                          const d = new Date(prev.year, prev.month + 1);
                          return { year: d.getFullYear(), month: d.getMonth() };
                        })}
                        className="p-1 rounded hover:bg-htg-card transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 text-htg-fg-muted" />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {getLocalizedDays(locale).map(d => (
                        <div key={d} className="text-center text-xs font-medium text-htg-fg-muted py-1">{d}</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {calendarDays.map((day, i) => {
                        if (day === null) return <div key={`empty-${i}`} />;
                        const dk = dateKey(calendarMonth.year, calendarMonth.month, day);
                        const daySlots = slotsByDate.get(dk) || [];
                        const hasSlots = daySlots.length > 0;
                        const isPast = new Date(dk) < new Date(new Date().toISOString().split('T')[0]);
                        const isToday = dk === new Date().toISOString().split('T')[0];
                        const hasSelected = daySlots.some(s => s.id === selectedSlotId);

                        return (
                          <div key={dk} className="relative group">
                            <div className={`text-center py-2 rounded-lg text-sm transition-colors ${
                              hasSelected
                                ? 'bg-htg-sage text-white font-bold'
                                : hasSlots
                                  ? 'bg-htg-sage/20 text-htg-fg font-medium cursor-pointer hover:bg-htg-sage/30'
                                  : isPast
                                    ? 'text-htg-fg-muted/30'
                                    : 'text-htg-fg-muted/60'
                            } ${isToday ? 'ring-1 ring-htg-warm/50' : ''}`}>
                              {day}
                              {hasSlots && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-htg-sage rounded-full" />}
                            </div>
                            {hasSlots && (
                              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 hidden group-hover:block">
                                <div className="bg-htg-card border border-htg-card-border rounded-lg shadow-xl p-2 min-w-[120px]">
                                  {daySlots.map(slot => (
                                    <button
                                      key={slot.id}
                                      onClick={() => { setSelectedSlotId(slot.id); setCalendarOpen(false); }}
                                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                                        selectedSlotId === slot.id
                                          ? 'bg-htg-sage text-white'
                                          : 'hover:bg-htg-surface text-htg-fg'
                                      }`}
                                    >
                                      <Clock className="w-3 h-3 shrink-0" />
                                      {slot.start_time.slice(0, 5)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Acceleration checkbox */}
            <label className={`flex items-center gap-3 text-sm cursor-pointer mt-3 p-4 rounded-xl border-2 transition-all ${
              wantAcceleration
                ? 'border-htg-warm/60 bg-htg-warm/10'
                : 'border-htg-card-border bg-htg-surface hover:border-htg-warm/30'
            }`}>
              <input
                type="checkbox"
                checked={wantAcceleration}
                onChange={e => setWantAcceleration(e.target.checked)}
                className="rounded border-htg-card-border accent-htg-warm w-4 h-4 shrink-0"
              />
              <Zap className={`w-4 h-4 shrink-0 ${wantAcceleration ? 'text-htg-warm' : 'text-htg-fg-muted'}`} />
              <div className="flex-1">
                <p className="font-medium text-htg-fg">Chcę przyspieszenie</p>
                <p className="text-xs text-htg-fg-muted">Powiadom gdy zwolni się wcześniejszy termin</p>
              </div>
            </label>
          </div>

          {/* Payment mode */}
          <div className="space-y-3">
            <span className="text-sm font-medium text-htg-fg block">Sposób płatności</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMode('full')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  paymentMode === 'full'
                    ? 'border-htg-sage bg-htg-sage/5'
                    : 'border-htg-card-border hover:border-htg-sage/40'
                }`}
              >
                <p className="font-medium text-htg-fg text-sm">Pełna płatność</p>
                <p className="text-htg-sage font-bold text-lg mt-1">{totalAmount} {currencyCode}</p>
                <p className="text-htg-fg-muted text-xs">jednorazowo</p>
              </button>
              <button
                onClick={() => { setPaymentMode('installments'); setPaymentMethod('stripe'); setProofFile(null); }}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  paymentMode === 'installments'
                    ? 'border-htg-sage bg-htg-sage/5'
                    : 'border-htg-card-border hover:border-htg-sage/40'
                }`}
              >
                <p className="font-medium text-htg-fg text-sm">{installmentsCount} raty miesięczne</p>
                <p className="text-htg-sage font-bold text-lg mt-1">{installmentsCount} × {installmentAmount} {currencyCode}</p>
                <p className="text-htg-fg-muted text-xs">pierwsza rata teraz</p>
              </button>
            </div>

            {paymentMode === 'installments' && (
              <div className="bg-htg-surface rounded-xl p-4 text-sm text-htg-fg-muted space-y-2">
                {Array.from({ length: installmentsCount }, (_, i) => (
                  <div key={i} className="flex justify-between">
                    <span>Rata {i + 1} {i === 0 ? '(teraz)' : `(za ${i * 30} dni)`}</span>
                    <span className={i === 0 ? 'font-bold text-htg-fg' : ''}>{installmentAmount} {currencyCode}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-htg-card-border font-medium text-htg-fg">
                  <span>Łącznie</span>
                  <span>{installmentsCount * installmentAmount} {currencyCode}</span>
                </div>
              </div>
            )}
          </div>

          {/* Payment method — only for full payment, logged-in users */}
          {paymentMode === 'full' && clientEmail && (
            <div className="space-y-3">
              <span className="text-sm font-medium text-htg-fg block">Metoda płatności</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => { setPaymentMethod('stripe'); setProofFile(null); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    paymentMethod === 'stripe'
                      ? 'border-htg-sage bg-htg-sage/5'
                      : 'border-htg-card-border hover:border-htg-sage/40'
                  }`}
                >
                  <p className="font-medium text-htg-fg text-sm">Karta / Blik</p>
                  <p className="text-htg-fg-muted text-xs mt-1">Szybka płatność online</p>
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    paymentMethod === 'transfer'
                      ? 'border-htg-sage bg-htg-sage/5'
                      : 'border-htg-card-border hover:border-htg-sage/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-htg-fg-muted" />
                    <p className="font-medium text-htg-fg text-sm">Przelew bankowy</p>
                  </div>
                  <p className="text-htg-fg-muted text-xs mt-1">Tradycyjny przelew</p>
                </button>
              </div>

              {paymentMethod === 'transfer' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <BankTransferCard
                    email={clientEmail}
                    labels={{
                      title: 'Dane do przelewu',
                      recipient: 'Odbiorca',
                      account: 'Numer konta',
                      reference: 'Tytuł przelewu',
                      download: 'Pobierz PDF',
                      print: 'Drukuj',
                    }}
                  />

                  <div className="bg-htg-surface border border-htg-card-border rounded-xl p-4">
                    <p className="text-sm font-medium text-htg-fg mb-3">Załącz potwierdzenie przelewu</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,.pdf"
                      onChange={e => setProofFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {!proofFile ? (
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-3 bg-htg-card border border-dashed border-htg-card-border rounded-lg text-sm text-htg-fg-muted hover:border-htg-sage/40 hover:text-htg-fg transition-colors w-full justify-center"
                      >
                        <Upload className="w-4 h-4" />
                        Wybierz plik (zdjęcie lub PDF, max 5MB)
                      </button>
                    ) : (
                      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-htg-sage/5 border border-htg-sage/20 rounded-lg">
                        <span className="text-sm text-htg-fg truncate">{proofFile.name}</span>
                        <button
                          onClick={() => { setProofFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                          className="shrink-0 p-1 rounded hover:bg-htg-surface"
                        >
                          <X className="w-4 h-4 text-htg-fg-muted" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-htg-fg-muted mt-2">
                      Po załączeniu potwierdzenia termin zostanie zarezerwowany. Weryfikacja płatności do 3 dni roboczych.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Gift toggle */}
          <div>
            <label className={`flex items-center gap-3 text-sm cursor-pointer p-4 rounded-xl border-2 transition-all ${
              isGift
                ? 'border-htg-warm/60 bg-htg-warm/5'
                : 'border-htg-card-border bg-htg-surface hover:border-htg-warm/30'
            }`}>
              <input
                type="checkbox"
                checked={isGift}
                onChange={e => { setIsGift(e.target.checked); if (!e.target.checked) { setGiftEmail(''); setGiftMessage(''); } }}
                className="rounded border-htg-card-border accent-htg-warm w-4 h-4 shrink-0"
              />
              <Gift className={`w-4 h-4 shrink-0 ${isGift ? 'text-htg-warm' : 'text-htg-fg-muted'}`} />
              <div className="flex-1">
                <p className="font-medium text-htg-fg">Kup jako prezent</p>
                <p className="text-xs text-htg-fg-muted">Sesja zostanie powiązana z inną osobą</p>
              </div>
            </label>

            {isGift && (
              <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <div>
                  <label className="text-xs font-medium text-htg-fg-muted block mb-1">Email obdarowanej osoby *</label>
                  <input
                    type="email"
                    value={giftEmail}
                    onChange={e => setGiftEmail(e.target.value)}
                    placeholder="np. syn@przykład.pl"
                    className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-warm/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-htg-fg-muted block mb-1">Wiadomość (opcjonalnie)</label>
                  <textarea
                    value={giftMessage}
                    onChange={e => setGiftMessage(e.target.value)}
                    placeholder="Napisz kilka słów do obdarowanej osoby…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-warm/40 resize-none"
                  />
                </div>
                <p className="text-xs text-htg-fg-muted">
                  Po zakupie otrzymasz link do przekazania. Obdarowana osoba może odebrać sesję na swoje konto lub skorzystać z Twojego.
                </p>
              </div>
            )}
          </div>

          {/* Recording & publication consent */}
          <label className="flex items-start gap-3 cursor-pointer bg-htg-surface border border-htg-card-border rounded-lg p-4">
            <input
              type="checkbox"
              checked={recordingConsent}
              onChange={(e) => setRecordingConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-htg-card-border text-htg-sage focus:ring-htg-sage shrink-0 accent-htg-sage"
            />
            <span className="text-sm text-htg-fg leading-relaxed">
              Rozumiem, że sesja jest nagrywana i może zostać opublikowana po montażu.
              Mogę wskazać fragmenty do usunięcia w ciągu 7 dni od udostępnienia nagrania.
              <span className="text-xs text-htg-fg-muted block mt-1">
                Zgoda jest warunkiem realizacji usługi — szczegóły w{' '}
                <a href="/terms#nagrania" target="_blank" rel="noopener" className="text-htg-indigo hover:underline">regulaminie</a> (pkt 6 i 8).
              </span>
            </span>
          </label>

          {/* Buy button */}
          <div>
            <button
              onClick={handleCheckout}
              disabled={loading || (!selectedSlotId && !wantAcceleration) || (paymentMethod === 'stripe' && !selectedSession?.priceId) || (paymentMethod === 'transfer' && (!proofFile || !selectedSlotId)) || (isGift && !giftEmail.trim()) || !recordingConsent}
              className="w-full bg-htg-sage text-white py-4 rounded-lg font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {ti('processing')}
                </span>
              ) : (
                <>
                  {paymentMethod === 'transfer' && `${ti('book_transfer')} — ${totalAmount} ${currencyCode}`}
                  {paymentMethod === 'stripe' && paymentMode === 'full' && `${labels.buy} — ${totalAmount} ${currencyCode}`}
                  {paymentMethod === 'stripe' && paymentMode === 'installments' && `${ti('pay_installment', { n: 1 })} — ${installmentAmount} ${currencyCode}`}
                </>
              )}
            </button>

            {!selectedSlotId && !wantAcceleration && slots.length > 0 && selectedSession?.priceId && (
              <p className="text-xs text-htg-warm text-center mt-2">Wybierz termin lub zaznacz opcję przyspieszenia</p>
            )}
            {isGift && !giftEmail.trim() && (
              <p className="text-xs text-htg-warm text-center mt-2">Podaj email obdarowanej osoby</p>
            )}
            {isPara && !selectedSession?.priceId && (
              <p className="text-xs text-htg-fg-muted text-center mt-2">
                Płatność online dla sesji par wkrótce. Skontaktuj się z nami bezpośrednio.
              </p>
            )}
            {paymentMethod === 'transfer' && !proofFile && (
              <p className="text-xs text-htg-warm text-center mt-2">Załącz potwierdzenie przelewu</p>
            )}
            {!recordingConsent && (selectedSession?.priceId || paymentMethod === 'transfer') && (
              <p className="text-xs text-htg-warm text-center mt-2">Potwierdź zgodę na nagrywanie i publikację sesji</p>
            )}
            <p className="text-xs text-htg-fg-muted text-center mt-3">{labels.cancel_policy}</p>
          </div>
        </div>
      )}
    </div>
  );
}
