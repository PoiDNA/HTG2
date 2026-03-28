'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Play, ShoppingCart, Check, ChevronDown, Calendar, Search,
  Grid3X3, List, SlidersHorizontal, Eye, Heart, Mic, Star, Tag, Clock,
  ArrowUpDown, Sparkles, CheckCircle, Headphones, EyeOff, Gift,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionInfo {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  view_count: number;
  monthSetId: string;
  monthTitle: string;
  monthLabel: string;
}

interface MonthSetInfo {
  id: string;
  title: string;
  month_label: string;
  sessions: { id: string; title: string; description: string | null; category: string | null; tags: string[]; view_count: number }[];
}

interface Prices {
  sessionPriceId: string;
  sessionAmount: number;
  monthlyPriceId: string;
  monthlyAmount: number;
}

// ---------------------------------------------------------------------------
// Filter config
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: 'all', label: 'Wszystkie', icon: Grid3X3 },
  { value: 'grupowa', label: 'Sesje', icon: Play },
  { value: 'solo_1_1', label: 'Sesje 1:1', icon: Mic },
  { value: 'slowo_natalii', label: 'Słowo od Natalii', icon: Heart },
  { value: 'specjalna', label: 'Specjalne', icon: Star },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Najnowsze' },
  { value: 'oldest', label: 'Najstarsze' },
  { value: 'popular', label: 'Najpopularniejsze' },
  { value: 'az', label: 'A → Z' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SessionCatalog({
  monthSets,
  prices,
  purchasedSessionIds = [],
  purchasedMonthSetIds = [],
  hasYearly = false,
}: {
  monthSets: MonthSetInfo[];
  prices: Prices;
  purchasedSessionIds?: string[];
  purchasedMonthSetIds?: string[];
  hasYearly?: boolean;
}) {
  // View mode
  const [view, setView] = useState<'sessions' | 'months'>('sessions');

  // Filters
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sort, setSort] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [hideOwned, setHideOwned] = useState(false);

  // Selection
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [selectedMonthSets, setSelectedMonthSets] = useState<Set<string>>(new Set());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Spotlight (months view)
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [isGift, setIsGift] = useState(false);
  const [giftEmail, setGiftEmail] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [showGiftForm, setShowGiftForm] = useState(false);
  const router = useRouter();

  // Purchased sets for fast lookup
  const purchasedSet = useMemo(() => new Set(purchasedSessionIds), [purchasedSessionIds]);
  const purchasedMonthSet = useMemo(() => new Set(purchasedMonthSetIds), [purchasedMonthSetIds]);

  const isPurchasedSession = useCallback((id: string) => hasYearly || purchasedSet.has(id), [hasYearly, purchasedSet]);
  const isPurchasedMonth = useCallback((id: string) => hasYearly || purchasedMonthSet.has(id), [hasYearly, purchasedMonthSet]);

  // Flatten all sessions with month context
  const allSessions: SessionInfo[] = useMemo(() => {
    return monthSets.flatMap(ms =>
      ms.sessions.map(s => ({
        ...s,
        monthSetId: ms.id,
        monthTitle: ms.title,
        monthLabel: ms.month_label,
      }))
    );
  }, [monthSets]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    allSessions.forEach(s => s.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [allSessions]);

  // Extract unique months for filter
  const monthOptions = useMemo(() =>
    monthSets.map(ms => ({ value: ms.month_label, label: ms.title })),
    [monthSets]
  );

  // Count owned
  const ownedCount = useMemo(() =>
    hasYearly ? allSessions.length : allSessions.filter(s => purchasedSet.has(s.id)).length,
    [allSessions, purchasedSet, hasYearly]
  );

  // Filter + sort sessions
  const filteredSessions = useMemo(() => {
    let result = [...allSessions];

    // Hide owned
    if (hideOwned) {
      result = result.filter(s => !isPurchasedSession(s.id));
    }

    // Category
    if (category !== 'all') {
      if (category === 'slowo_natalii') {
        result = result.filter(s => s.category === 'slowo_natalii' || s.title.toLowerCase().includes('słowo od natalii'));
      } else {
        result = result.filter(s => s.category === category);
      }
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.tags?.some(t => t.toLowerCase().includes(q))
      );
    }

    // Month filter
    if (selectedMonth) {
      result = result.filter(s => s.monthLabel === selectedMonth);
    }

    // Tag filter
    if (selectedTag) {
      result = result.filter(s => s.tags?.includes(selectedTag));
    }

    // Sort
    switch (sort) {
      case 'newest':
        result.sort((a, b) => b.monthLabel.localeCompare(a.monthLabel));
        break;
      case 'oldest':
        result.sort((a, b) => a.monthLabel.localeCompare(b.monthLabel));
        break;
      case 'popular':
        result.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
        break;
      case 'az':
        result.sort((a, b) => a.title.localeCompare(b.title, 'pl'));
        break;
    }

    return result;
  }, [allSessions, category, searchQuery, selectedMonth, selectedTag, sort, hideOwned, isPurchasedSession]);

  // Spotlight scroll
  useEffect(() => {
    if (spotlightId && spotlightRef.current) {
      setTimeout(() => spotlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [spotlightId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSpotlightId(null); setExpandedSession(null); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const toggleSession = useCallback((id: string) => {
    if (isPurchasedSession(id)) return; // can't select purchased
    setSelectedSessions(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, [isPurchasedSession]);

  const toggleMonthSet = useCallback((id: string) => {
    if (isPurchasedMonth(id)) return; // can't select purchased
    setSelectedMonthSets(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, [isPurchasedMonth]);

  async function handleCheckout() {
    setLoading(true);
    try {
      const isMonthMode = view === 'months' && selectedMonthSets.size > 0;
      const giftMeta = isGift && giftEmail.trim()
        ? { gift_for_email: giftEmail.trim().toLowerCase(), ...(giftMessage.trim() && { gift_message: giftMessage.trim() }) }
        : {};
      const body = isMonthMode
        ? {
            priceId: prices.monthlyPriceId, mode: 'payment',
            quantity: selectedMonthSets.size,
            metadata: { type: 'monthly', monthLabels: JSON.stringify(
              Array.from(selectedMonthSets).map(id => monthSets.find(m => m.id === id)?.month_label).filter(Boolean)
            ), ...giftMeta },
          }
        : {
            priceId: prices.sessionPriceId, mode: 'payment',
            quantity: selectedSessions.size,
            metadata: { type: 'sessions', sessionIds: JSON.stringify(Array.from(selectedSessions)), ...giftMeta },
          };

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401) { router.push('/login'); return; }
      if (data.url) window.location.href = data.url;
    } catch {} finally { setLoading(false); }
  }

  const spotlightSet = monthSets.find(ms => ms.id === spotlightId);
  const cartCount = view === 'months' ? selectedMonthSets.size : selectedSessions.size;
  const totalPrice = view === 'months'
    ? selectedMonthSets.size * prices.monthlyAmount
    : selectedSessions.size * prices.sessionAmount;

  const hasActiveFilters = category !== 'all' || selectedMonth || selectedTag || hideOwned;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="pb-28">

      {/* ── View toggle + Search ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* View toggle */}
        <div className="flex bg-htg-surface rounded-xl p-1 shrink-0">
          <button
            onClick={() => { setView('sessions'); setSpotlightId(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'sessions' ? 'bg-htg-indigo text-white' : 'text-htg-fg-muted hover:text-htg-fg'
            }`}
          >
            <List className="w-4 h-4 inline mr-1.5" />Sesje
          </button>
          <button
            onClick={() => setView('months')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'months' ? 'bg-htg-indigo text-white' : 'text-htg-fg-muted hover:text-htg-fg'
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-1.5" />Miesiące
          </button>
        </div>

        {/* Search + Filter — only in sessions view */}
        {view === 'sessions' && (
          <>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Szukaj sesji po tytule, opisie, słowach kluczowych..."
                className="w-full pl-10 pr-4 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/50"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors shrink-0 flex items-center gap-2 ${
                showFilters ? 'border-htg-sage bg-htg-sage/10 text-htg-sage' : 'border-htg-card-border text-htg-fg-muted hover:text-htg-fg'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtry
              {hasActiveFilters && (
                <span className="w-2 h-2 bg-htg-sage rounded-full" />
              )}
            </button>
          </>
        )}
      </div>

      {/* ── Filters panel (sessions view only) ── */}
      {showFilters && view === 'sessions' && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">

          {/* Hide owned toggle — only show if user has any purchased sessions */}
          {ownedCount > 0 && (
            <div className="flex items-center justify-between pb-3 border-b border-htg-card-border">
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-htg-fg-muted" />
                <span className="text-sm font-medium text-htg-fg">
                  Ukryj kupione
                  <span className="ml-1.5 text-xs text-htg-fg-muted">({ownedCount})</span>
                </span>
              </div>
              <button
                onClick={() => setHideOwned(!hideOwned)}
                className={`relative w-10 h-5 rounded-full transition-colors ${hideOwned ? 'bg-htg-sage' : 'bg-htg-surface border border-htg-card-border'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${hideOwned ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}

          {/* Categories */}
          <div>
            <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">Kategoria</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      category === c.value
                        ? 'bg-htg-sage text-white'
                        : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />{c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Month filter */}
          <div>
            <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">Miesiąc</p>
            <select
              value={selectedMonth || ''}
              onChange={e => setSelectedMonth(e.target.value || null)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
            >
              <option value="">Wszystkie miesiące</option>
              {monthOptions.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">Słowa kluczowe</p>
              <div className="flex flex-wrap gap-1.5">
                {allTags.slice(0, 20).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                      selectedTag === tag
                        ? 'bg-htg-warm text-white'
                        : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
                    }`}
                  >
                    <Tag className="w-3 h-3 inline mr-1" />{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sort */}
          <div>
            <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-2">Sortowanie</p>
            <div className="flex gap-2">
              {SORT_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setSort(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sort === s.value ? 'bg-htg-indigo text-white' : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear filters */}
          {(hasActiveFilters || searchQuery) && (
            <button
              onClick={() => { setCategory('all'); setSelectedMonth(null); setSelectedTag(null); setSearchQuery(''); setHideOwned(false); }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Wyczyść filtry
            </button>
          )}
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="flex items-center justify-between mb-4 text-sm text-htg-fg-muted">
        <span>
          {view === 'sessions'
            ? `${filteredSessions.length} sesji`
            : `${monthSets.length} miesięcy`
          }
          {view === 'sessions' && !hideOwned && <span className="ml-2">· {prices.sessionAmount} PLN / sesja</span>}
          {view === 'months' && <span className="ml-2">· {prices.monthlyAmount} PLN / miesiąc</span>}
          {hideOwned && filteredSessions.length < allSessions.length && (
            <span className="ml-2 text-emerald-400/70">· {ownedCount} w kolekcji ukrytych</span>
          )}
        </span>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* ── SESSIONS VIEW (flat list) ── */}
      {/* ══════════════════════════════════════════════════ */}
      {view === 'sessions' && (
        <div className="space-y-2">
          {filteredSessions.map((s) => {
            const isSelected = selectedSessions.has(s.id);
            const isExpanded = expandedSession === s.id;
            const isPurchased = isPurchasedSession(s.id);

            return (
              <div
                key={s.id}
                className={`rounded-xl border-2 transition-all ${
                  isPurchased
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : isExpanded
                      ? 'border-htg-sage/40 bg-htg-card shadow-lg shadow-htg-sage/5'
                      : isSelected
                        ? 'border-htg-sage/30 bg-htg-sage/5'
                        : 'border-htg-card-border bg-htg-card hover:border-htg-sage/20'
                }`}
              >
                {/* Main row */}
                <div className="flex items-center gap-3 p-4">
                  {/* Purchased indicator OR checkbox */}
                  {isPurchased ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                  ) : (
                    <button
                      onClick={() => toggleSession(s.id)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-htg-sage border-htg-sage' : 'border-htg-fg-muted/30 hover:border-htg-sage'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </button>
                  )}

                  {/* Title + meta */}
                  <button
                    onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className={`font-medium text-sm leading-snug ${isPurchased ? 'text-htg-fg' : 'text-htg-fg'}`}>
                      {s.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-htg-fg-muted flex items-center gap-1">
                        <Calendar className="w-3 h-3" />{s.monthTitle.replace('Sesje ', '')}
                      </span>
                      {isPurchased && (
                        <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />W kolekcji
                        </span>
                      )}
                      {s.category === 'slowo_natalii' && (
                        <span className="text-xs bg-htg-warm/20 text-htg-warm px-2 py-0.5 rounded-full">Słowo od Natalii</span>
                      )}
                      {s.category === 'solo_1_1' && (
                        <span className="text-xs bg-htg-indigo/20 text-htg-indigo px-2 py-0.5 rounded-full">1:1</span>
                      )}
                      {(s.view_count || 0) > 0 && (
                        <span className="text-xs text-htg-fg-muted flex items-center gap-0.5">
                          <Eye className="w-3 h-3" />{s.view_count}
                        </span>
                      )}
                      {s.tags?.slice(0, 3).map(t => (
                        <span key={t} className="text-xs bg-htg-surface text-htg-fg-muted px-1.5 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>

                  {/* Price (hidden if purchased) OR listen button */}
                  {isPurchased ? (
                    <a
                      href="/pl/konto/sesje"
                      className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium shrink-0 hover:text-emerald-300 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <Headphones className="w-4 h-4" />
                      Odsłuchaj
                    </a>
                  ) : (
                    <span className="text-htg-sage font-bold text-sm shrink-0">{prices.sessionAmount} PLN</span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-htg-fg-muted transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-5 pt-1 border-t border-htg-card-border/50">
                    {s.description ? (
                      <p className="text-htg-fg-muted text-sm leading-relaxed whitespace-pre-line mt-3">
                        {s.description.slice(0, 800)}
                        {s.description.length > 800 && '...'}
                      </p>
                    ) : (
                      <p className="text-htg-fg-muted/50 text-sm mt-3 italic">Brak opisu sesji.</p>
                    )}
                    <div className="flex items-center gap-3 mt-4">
                      {isPurchased ? (
                        <a
                          href="/pl/konto/sesje"
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
                        >
                          <Headphones className="w-4 h-4" />
                          Przejdź do sesji
                        </a>
                      ) : (
                        <button
                          onClick={() => toggleSession(s.id)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isSelected
                              ? 'bg-htg-sage text-white'
                              : 'bg-htg-sage/10 border border-htg-sage text-htg-sage hover:bg-htg-sage hover:text-white'
                          }`}
                        >
                          {isSelected ? '✓ W koszyku' : `Dodaj — ${prices.sessionAmount} PLN`}
                        </button>
                      )}
                      <span className="text-xs text-htg-fg-muted">z pakietu {s.monthTitle}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredSessions.length === 0 && (
            <div className="text-center py-16">
              <Search className="w-10 h-10 text-htg-fg-muted/30 mx-auto mb-3" />
              <p className="text-htg-fg-muted">Brak sesji pasujących do filtrów</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* ── MONTHS VIEW (grid + spotlight) ── */}
      {/* ══════════════════════════════════════════════════ */}
      {view === 'months' && (
        <>
          {/* Month grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-6">
            {monthSets.map(ms => {
              const isSpotlight = spotlightId === ms.id;
              const isSelected = selectedMonthSets.has(ms.id);
              const isPurchased = isPurchasedMonth(ms.id);
              return (
                <button
                  key={ms.id}
                  onClick={() => setSpotlightId(isSpotlight ? null : ms.id)}
                  className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                    isPurchased
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : isSpotlight
                        ? 'border-htg-sage bg-htg-sage/20 ring-2 ring-htg-sage/40 scale-105 z-10'
                        : isSelected
                          ? 'border-htg-sage/60 bg-htg-sage/10'
                          : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40 hover:scale-[1.02]'
                  }`}
                >
                  <p className="font-serif font-bold text-sm text-htg-fg leading-tight">
                    {ms.title.replace('Sesje ', '')}
                  </p>
                  <p className="text-htg-fg-muted text-xs mt-1">{ms.sessions.length} sesji</p>
                  {isPurchased ? (
                    <p className="text-emerald-400 text-xs mt-1 font-medium flex items-center gap-0.5">
                      <CheckCircle className="w-3 h-3" />Kupiony
                    </p>
                  ) : (
                    <p className="text-htg-sage font-bold text-xs mt-1">{prices.monthlyAmount} PLN</p>
                  )}
                  {isSelected && !isPurchased && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-htg-sage rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </span>
                  )}
                  {isPurchased && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Spotlight */}
          {spotlightSet && (
            <div ref={spotlightRef} className={`relative bg-htg-card border-2 rounded-2xl p-6 md:p-8 mb-8 animate-in fade-in slide-in-from-top-4 duration-300 ${isPurchasedMonth(spotlightSet.id) ? 'border-emerald-500/40' : 'border-htg-sage/30'}`}>
              <button onClick={() => setSpotlightId(null)} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-htg-surface text-htg-fg-muted hover:text-htg-fg">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-start gap-4 mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isPurchasedMonth(spotlightSet.id) ? 'bg-emerald-500/20' : 'bg-htg-sage/20'}`}>
                  <Calendar className={`w-6 h-6 ${isPurchasedMonth(spotlightSet.id) ? 'text-emerald-400' : 'text-htg-sage'}`} />
                </div>
                <div>
                  <h2 className="font-serif font-bold text-2xl text-htg-fg">{spotlightSet.title}</h2>
                  <p className="text-htg-fg-muted mt-1">
                    {spotlightSet.sessions.length} sesji
                    {isPurchasedMonth(spotlightSet.id) ? (
                      <span className="ml-2 text-emerald-400 font-medium text-sm flex items-center gap-1 inline-flex">
                        <CheckCircle className="w-3.5 h-3.5" />W kolekcji
                      </span>
                    ) : (
                      <span className="text-htg-sage font-bold"> · {prices.monthlyAmount} PLN</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                {spotlightSet.sessions.map((s, i) => {
                  const isExp = expandedSession === s.id;
                  const sessionPurchased = isPurchasedSession(s.id);
                  return (
                    <div key={s.id} className={`rounded-xl border transition-all ${
                      sessionPurchased ? 'border-emerald-500/30 bg-emerald-500/5' : isExp ? 'border-htg-sage/40 bg-htg-sage/5' : 'border-htg-card-border hover:border-htg-sage/30'
                    }`}>
                      <button
                        onClick={() => setExpandedSession(isExp ? null : s.id)}
                        className="w-full flex items-center gap-3 p-4 text-left"
                      >
                        <span className="text-htg-sage font-mono text-xs font-bold w-6 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                        <p className="font-medium text-htg-fg text-sm flex-1">{s.title}</p>
                        {sessionPurchased && (
                          <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shrink-0">
                            <CheckCircle className="w-3 h-3" />W kolekcji
                          </span>
                        )}
                        {s.category === 'slowo_natalii' && !sessionPurchased && (
                          <span className="text-xs bg-htg-warm/20 text-htg-warm px-2 py-0.5 rounded-full shrink-0">Słowo od Natalii</span>
                        )}
                        {s.description && (
                          <ChevronDown className={`w-4 h-4 text-htg-fg-muted shrink-0 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                        )}
                      </button>
                      {isExp && s.description && (
                        <div className="px-4 pb-4 pl-14">
                          <p className="text-htg-fg-muted text-sm leading-relaxed whitespace-pre-line">
                            {s.description.slice(0, 800)}{s.description.length > 800 && '...'}
                          </p>
                          {s.tags && s.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {s.tags.map((tag: string) => (
                                <span key={tag} className="text-xs bg-htg-surface text-htg-fg-muted px-2 py-0.5 rounded-full">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!isPurchasedMonth(spotlightSet.id) && (
                <button
                  onClick={() => toggleMonthSet(spotlightSet.id)}
                  className={`px-6 py-3 rounded-xl font-medium text-sm transition-all ${
                    selectedMonthSets.has(spotlightSet.id)
                      ? 'bg-htg-sage text-white'
                      : 'bg-htg-sage/10 border border-htg-sage text-htg-sage hover:bg-htg-sage hover:text-white'
                  }`}
                >
                  {selectedMonthSets.has(spotlightSet.id)
                    ? <span className="flex items-center gap-2"><Check className="w-4 h-4" /> W koszyku</span>
                    : `Dodaj pakiet — ${prices.monthlyAmount} PLN`
                  }
                </button>
              )}
              {isPurchasedMonth(spotlightSet.id) && (
                <a
                  href="/pl/konto/sesje"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
                >
                  <Headphones className="w-4 h-4" />
                  Odsłuchaj sesje z pakietu
                </a>
              )}
            </div>
          )}

          {!spotlightId && (
            <div className="text-center py-8">
              <Sparkles className="w-8 h-8 text-htg-fg-muted/40 mx-auto mb-3" />
              <p className="text-htg-fg-muted text-sm">Kliknij miesiąc aby zobaczyć szczegóły sesji</p>
            </div>
          )}
        </>
      )}

      {/* ── Floating cart ── */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-htg-card/95 backdrop-blur-md border-t border-htg-card-border shadow-2xl">
          {/* Gift form (expanded) */}
          {showGiftForm && (
            <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 space-y-2 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2 text-sm font-medium text-htg-fg">
                <Gift className="w-4 h-4 text-htg-warm" />
                Kup jako prezent
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={giftEmail}
                  onChange={e => setGiftEmail(e.target.value)}
                  placeholder="Email obdarowanej osoby *"
                  className="flex-1 px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-warm/40"
                />
                <input
                  type="text"
                  value={giftMessage}
                  onChange={e => setGiftMessage(e.target.value)}
                  placeholder="Wiadomość (opcjonalnie)"
                  className="flex-1 px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-warm/40"
                />
              </div>
            </div>
          )}
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-htg-sage" />
              <span className="text-htg-fg font-medium">{cartCount} {view === 'sessions' ? 'sesji' : 'pakietów'}</span>
              <button
                onClick={() => { view === 'sessions' ? setSelectedSessions(new Set()) : setSelectedMonthSets(new Set()); setIsGift(false); setShowGiftForm(false); setGiftEmail(''); setGiftMessage(''); }}
                className="text-htg-fg-muted hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
              {/* Gift toggle */}
              <button
                onClick={() => { setIsGift(!isGift); setShowGiftForm(!isGift); if (isGift) { setGiftEmail(''); setGiftMessage(''); } }}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  isGift
                    ? 'border-htg-warm/60 bg-htg-warm/10 text-htg-warm'
                    : 'border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:border-htg-warm/30'
                }`}
              >
                <Gift className="w-3.5 h-3.5" />
                Prezent
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold text-htg-fg">{totalPrice} PLN</span>
              <button
                onClick={handleCheckout}
                disabled={loading || (isGift && !giftEmail.trim())}
                title={isGift && !giftEmail.trim() ? 'Podaj email obdarowanej osoby' : undefined}
                className="bg-htg-sage text-white px-6 py-3 rounded-xl font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '...' : 'Przejdź do płatności'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
