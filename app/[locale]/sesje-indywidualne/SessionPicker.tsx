'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from '@/i18n-config';
import { User, Users, Calendar, MessageSquare, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Zap, Video } from 'lucide-react';

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

interface PreSessionOption {
  staffId: string;
  staffName: string;
  staffNameWith: string; // odmiana narzędnikowa: "z Agatą"
  priceId: string;
  pricePln: number;
}

interface SessionPickerProps {
  sessions: SessionOption[];
  preSessionOptions?: Record<string, PreSessionOption>; // keyed by session type, e.g. 'natalia_agata'
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

const SESSION_ICONS: Record<string, typeof User> = {
  natalia_solo: User,
  natalia_agata: Users,
  natalia_justyna: Users,
};

const SESSION_PEOPLE: Record<string, string[]> = {
  natalia_solo: ['Natalia HTG'],
  natalia_agata: ['Natalia HTG', 'Agata HTG (asysta)'],
  natalia_justyna: ['Natalia HTG', 'Justyna HTG (asysta)'],
};

const DAYS_PL = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const MONTHS_PL = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

export function SessionPicker({ sessions, preSessionOptions = {}, labels }: SessionPickerProps) {
  const [selected, setSelected] = useState<string | null>(null);
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
  const [addPreSession, setAddPreSession] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'full' | 'installments' | 'custom'>('full');
  const [customAmount, setCustomAmount] = useState('');
  const router = useRouter();

  const selectedSession = sessions.find((s) => s.slug === selected);
  const selectedSlot = slots.find(s => s.id === selectedSlotId);
  const activePreSessionOption = selectedSession ? preSessionOptions[selectedSession.sessionType] : null;

  // Load available slots when session type changes — fetch next 3 months
  useEffect(() => {
    if (!selectedSession) { setSlots([]); setSelectedSlotId(null); return; }

    setLoadingSlots(true);

    // Fetch slots for next 3 months
    const now = new Date();
    const monthPromises = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthPromises.push(
        fetch(`/api/booking/slots?month=${m}`).then(r => r.json())
      );
    }

    Promise.all(monthPromises)
      .then(results => {
        const allSlots: SlotInfo[] = [];
        for (const data of results) {
          if (data.slots) {
            // API returns grouped by date: { "2026-03-30": [...] }
            for (const dateSlots of Object.values(data.slots)) {
              for (const slot of dateSlots as SlotInfo[]) {
                // Show slots matching this session type, OR natalia_solo (user can book solo with Natalia)
                if (
                  slot.session_type === selectedSession.sessionType ||
                  (selectedSession.sessionType === 'natalia_solo' && slot.session_type === 'natalia_solo') ||
                  // For natalia_agata/natalia_justyna, also show natalia_solo slots (they are compatible)
                  slot.session_type === 'natalia_solo'
                ) {
                  allSlots.push(slot);
                }
              }
            }
          }
        }
        // Sort by date + time
        allSlots.sort((a, b) => {
          const cmp = a.slot_date.localeCompare(b.slot_date);
          return cmp !== 0 ? cmp : a.start_time.localeCompare(b.start_time);
        });
        // Remove duplicates
        const seen = new Set<string>();
        const unique = allSlots.filter(s => {
          const key = s.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSlots(unique);
        setSelectedSlotId(null);
        setLoadingSlots(false);
      })
      .catch(() => setLoadingSlots(false));
  }, [selectedSession?.sessionType]);

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const map = new Map<string, SlotInfo[]>();
    slots.forEach(s => {
      const existing = map.get(s.slot_date) || [];
      existing.push(s);
      map.set(s.slot_date, existing);
    });
    return map;
  }, [slots]);

  // Earliest available slot
  const earliestSlot = slots.length > 0 ? slots[0] : null;

  // Calendar days for current month view
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
    const day = DAYS_PL[d.getDay()];
    return `${day} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  function dateKey(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const preSessionAmount = addPreSession && activePreSessionOption ? activePreSessionOption.pricePln : 0;
  const totalAmount = selectedSession ? selectedSession.amount / 100 : 0;
  // Installments: 1200 PLN = 3×400, 1600 PLN = 4×400
  const isWithAssistant = selectedSession?.sessionType === 'natalia_agata' || selectedSession?.sessionType === 'natalia_justyna';
  const installmentsCount = isWithAssistant ? 4 : 3;
  const installmentAmount = 400; // always 400 PLN per installment
  const customAmountNum = parseInt(customAmount) || 0;

  const payAmount = (paymentMode === 'full'
    ? totalAmount
    : paymentMode === 'installments'
      ? installmentAmount
      : customAmountNum) + preSessionAmount;

  async function handleCheckout() {
    if (!selectedSession || payAmount <= 0) return;
    setLoading(true);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: selectedSession.priceId,
          mode: 'payment',
          // For installments/custom: override amount (session only — pre-session added via addOns)
          ...(paymentMode !== 'full' && { amountOverride: (payAmount - preSessionAmount) * 100 }),
          // Pre-session add-on: separate line item at fixed Stripe price
          ...(addPreSession && activePreSessionOption && {
            addOns: [{ priceId: activePreSessionOption.priceId }],
          }),
          metadata: {
            type: 'individual',
            session_type: selectedSession.sessionType,
            slot_id: selectedSlotId || '',
            want_acceleration: wantAcceleration ? 'true' : 'false',
            payment_mode: paymentMode,
            total_amount: String(totalAmount * 100),
            installment_number: paymentMode === 'installments' ? '1' : undefined,
            installments_total: paymentMode === 'installments' ? String(installmentsCount) : undefined,
            // Pre-session metadata for webhook
            ...(addPreSession && activePreSessionOption && {
              pre_session_staff_id: activePreSessionOption.staffId,
            }),
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

  return (
    <div className="space-y-6">
      {/* Step 1: Choose session type */}
      <h2 className="font-serif font-semibold text-xl text-htg-fg">{labels.choose}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sessions.map((session) => {
          const Icon = SESSION_ICONS[session.sessionType] || User;
          const people = SESSION_PEOPLE[session.sessionType] || [];
          const isSelected = selected === session.slug;
          const price = (session.amount / 100).toLocaleString('pl-PL');

          return (
            <button
              key={session.slug}
              onClick={() => { setSelected(session.slug); setCalendarOpen(false); setSelectedSlotId(null); }}
              className={`relative text-left p-6 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-htg-sage bg-htg-sage/5 ring-2 ring-htg-sage/20'
                  : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
              }`}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-htg-sage rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
              <Icon className={`w-8 h-8 mb-3 ${isSelected ? 'text-htg-sage' : 'text-htg-fg-muted'}`} />
              <h3 className="font-serif font-semibold text-htg-fg mb-1">{session.name}</h3>
              <div className="space-y-1 mb-4">
                {people.map((p) => (
                  <p key={p} className="text-xs text-htg-fg-muted">{p}</p>
                ))}
              </div>
              <p className="text-2xl font-bold text-htg-fg">
                {price} <span className="text-sm font-normal text-htg-fg-muted">PLN</span>
              </p>
              <p className="text-xs text-htg-fg-muted">{labels.per_session}</p>
            </button>
          );
        })}
      </div>

      {/* Step 2: Choose slot */}
      {selected && (
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
                {/* Earliest available — prominent */}
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

                {/* Selected slot display */}
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
                    {/* Month navigation */}
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
                        {MONTHS_PL[calendarMonth.month]} {calendarMonth.year}
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

                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {DAYS_PL.map(d => (
                        <div key={d} className="text-center text-xs font-medium text-htg-fg-muted py-1">{d}</div>
                      ))}
                    </div>

                    {/* Calendar days */}
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
                            <div
                              className={`text-center py-2 rounded-lg text-sm transition-colors ${
                                hasSelected
                                  ? 'bg-htg-sage text-white font-bold'
                                  : hasSlots
                                    ? 'bg-htg-sage/20 text-htg-fg font-medium cursor-pointer hover:bg-htg-sage/30'
                                    : isPast
                                      ? 'text-htg-fg-muted/30'
                                      : 'text-htg-fg-muted/60'
                              } ${isToday ? 'ring-1 ring-htg-warm/50' : ''}`}
                            >
                              {day}
                              {hasSlots && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-htg-sage rounded-full" />}
                            </div>

                            {/* Tooltip with time slots */}
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

            {/* Pre-session add-on */}
            {activePreSessionOption && (
              <label className={`flex items-center gap-3 text-sm cursor-pointer mt-2 p-4 rounded-xl border-2 transition-all ${
                addPreSession
                  ? 'border-purple-500/60 bg-purple-900/10'
                  : 'border-htg-card-border bg-htg-surface hover:border-purple-400/40'
              }`}>
                <input
                  type="checkbox"
                  checked={addPreSession}
                  onChange={e => setAddPreSession(e.target.checked)}
                  className="rounded border-htg-card-border accent-purple-500 w-4 h-4 shrink-0"
                />
                <Video className={`w-4 h-4 shrink-0 ${addPreSession ? 'text-purple-400' : 'text-htg-fg-muted'}`} />
                <div className="flex-1">
                  <p className="font-medium text-htg-fg">
                    Dodaj spotkanie wstępne z {activePreSessionOption.staffNameWith}
                  </p>
                  <p className="text-xs text-htg-fg-muted">15 min online przed Twoją sesją — termin wybierzesz później</p>
                </div>
                <span className={`font-bold text-sm shrink-0 ${addPreSession ? 'text-purple-400' : 'text-htg-fg-muted'}`}>
                  +{activePreSessionOption.pricePln} PLN
                </span>
              </label>
            )}
          </div>

          {/* Payment mode selector */}
          <div className="space-y-3">
            <span className="text-sm font-medium text-htg-fg block">Sposób płatności</span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Full payment */}
              <button
                onClick={() => setPaymentMode('full')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  paymentMode === 'full'
                    ? 'border-htg-sage bg-htg-sage/5'
                    : 'border-htg-card-border hover:border-htg-sage/40'
                }`}
              >
                <p className="font-medium text-htg-fg text-sm">Pełna płatność</p>
                <p className="text-htg-sage font-bold text-lg mt-1">{totalAmount} PLN</p>
                <p className="text-htg-fg-muted text-xs">jednorazowo</p>
              </button>

              {/* 3 installments */}
              <button
                onClick={() => setPaymentMode('installments')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  paymentMode === 'installments'
                    ? 'border-htg-sage bg-htg-sage/5'
                    : 'border-htg-card-border hover:border-htg-sage/40'
                }`}
              >
                <p className="font-medium text-htg-fg text-sm">{installmentsCount} raty miesięczne</p>
                <p className="text-htg-sage font-bold text-lg mt-1">{installmentsCount} × {installmentAmount} PLN</p>
                <p className="text-htg-fg-muted text-xs">pierwsza rata teraz</p>
              </button>

              {/* Custom amount */}
              <button
                onClick={() => setPaymentMode('custom')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  paymentMode === 'custom'
                    ? 'border-htg-sage bg-htg-sage/5'
                    : 'border-htg-card-border hover:border-htg-sage/40'
                }`}
              >
                <p className="font-medium text-htg-fg text-sm">Dopłata</p>
                <p className="text-htg-fg-muted text-xs mt-1">Wpisz kwotę wpłaty</p>
              </button>
            </div>

            {/* Installments detail */}
            {paymentMode === 'installments' && (
              <div className="bg-htg-surface rounded-xl p-4 text-sm text-htg-fg-muted space-y-2">
                {Array.from({ length: installmentsCount }, (_, i) => (
                  <div key={i} className="flex justify-between">
                    <span>Rata {i + 1} {i === 0 ? '(teraz)' : `(za ${i * 30} dni)`}</span>
                    {i === 0 && addPreSession && preSessionAmount > 0 ? (
                      <span className="font-bold text-htg-fg">
                        {installmentAmount} + {preSessionAmount} PLN
                        <span className="text-htg-fg-muted font-normal text-xs ml-1">= {installmentAmount + preSessionAmount} PLN</span>
                      </span>
                    ) : (
                      <span className={i === 0 ? 'font-bold text-htg-fg' : ''}>{installmentAmount} PLN</span>
                    )}
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-htg-card-border font-medium text-htg-fg">
                  <span>Łącznie</span>
                  <span>{installmentsCount * installmentAmount + (addPreSession ? preSessionAmount : 0)} PLN</span>
                </div>
              </div>
            )}

            {/* Custom amount input */}
            {paymentMode === 'custom' && (
              <div className="bg-htg-surface rounded-xl p-4">
                <label className="block">
                  <span className="text-sm text-htg-fg-muted mb-1 block">Kwota wpłaty (PLN)</span>
                  <input
                    type="number"
                    min="1"
                    max={totalAmount}
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    placeholder={`min. 1 PLN, max. ${totalAmount} PLN`}
                    className="w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-lg font-bold"
                  />
                </label>
                {customAmountNum > 0 && customAmountNum < totalAmount && (
                  <p className="text-xs text-htg-fg-muted mt-2">
                    Pozostało do zapłaty: <span className="font-bold text-htg-fg">{totalAmount - customAmountNum} PLN</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Buy button */}
          <div>
            <button
              onClick={handleCheckout}
              disabled={loading || (!selectedSlotId && !wantAcceleration) || payAmount <= 0}
              className="w-full bg-htg-sage text-white py-4 rounded-lg font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Przetwarzanie...
                </span>
              ) : (
                <>
                  {paymentMode === 'full' && `${labels.buy} — ${totalAmount + preSessionAmount} PLN`}
                  {paymentMode === 'installments' && `Zapłać 1. ratę — ${installmentAmount + preSessionAmount} PLN`}
                  {paymentMode === 'custom' && `Wpłać — ${customAmountNum > 0 ? customAmountNum + preSessionAmount : '...'} PLN`}
                </>
              )}
            </button>

            {!selectedSlotId && !wantAcceleration && slots.length > 0 && (
              <p className="text-xs text-htg-warm text-center mt-2">Wybierz termin lub zaznacz opcję przyspieszenia</p>
            )}

            <p className="text-xs text-htg-fg-muted text-center mt-3">
              {labels.cancel_policy}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
