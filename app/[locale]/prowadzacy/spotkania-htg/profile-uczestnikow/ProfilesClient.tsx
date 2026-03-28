'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users2, RefreshCw, Shuffle, ChevronUp, ChevronDown,
  ArrowLeft, Info, Star, BarChart2, Heart, Check,
  AlertTriangle, Sparkles, Edit2, X,
} from 'lucide-react';
import type { GroupingResult, GroupProposal } from '@/lib/meetings/grouping';

// ── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  user_id: string;
  display_name: string;
  email: string;
  score_merytoryczny: number;
  score_organizacyjny: number;
  score_relacyjny: number;
  score_merytoryczny_override: number | null;
  sessions_total: number;
  sessions_completed: number;
  sessions_as_moderator: number;
  avg_speaking_seconds: number;
  unique_groupmates: number;
  admin_notes: string | null;
  last_computed_at: string | null;
}

type SortKey = 'd1' | 'd2' | 'd3' | 'composite' | 'sessions' | 'name';
type SortDir = 'asc' | 'desc';
type Mode    = 'table' | 'proposal';

// ── Helpers ──────────────────────────────────────────────────────────────────
function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  );
}

function DimLabel({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1" style={{ color }}>
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </div>
  );
}

const D1_COLOR = '#f59e0b';
const D2_COLOR = '#4ade80';
const D3_COLOR = '#a78bfa';

// ── Score edit modal ─────────────────────────────────────────────────────────
function EditD1Modal({
  profile,
  onSave,
  onClose,
}: {
  profile: Profile;
  onSave: (userId: string, score: number, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [score, setScore] = useState(profile.score_merytoryczny_override ?? profile.score_merytoryczny);
  const [notes, setNotes] = useState(profile.admin_notes ?? '');
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0d1220] border border-white/12 rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-htg-fg">{profile.display_name}</h3>
            <p className="text-xs text-htg-fg-muted mt-0.5">Edytuj poziom merytoryczny (D1)</p>
          </div>
          <button onClick={onClose} className="text-htg-fg-muted/50 hover:text-htg-fg/70 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-htg-fg-muted mb-2">
              Poziom merytoryczny: <span style={{ color: D1_COLOR }}>{score.toFixed(1)}</span>
            </label>
            <input
              type="range" min="0" max="10" step="0.5"
              value={score}
              onChange={e => setScore(parseFloat(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-htg-fg-muted/40 mt-1">
              <span>0 — słaby</span><span>5 — przeciętny</span><span>10 — wybitny</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-htg-fg-muted mb-2">Notatki admina</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Obserwacje, powody oceny..."
              className="w-full px-3 py-2.5 rounded-xl bg-htg-surface border border-htg-card-border
                text-htg-fg text-sm placeholder:text-htg-fg-muted/40 focus:outline-none
                focus:border-htg-warm/40 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-htg-surface text-htg-fg-muted text-sm hover:bg-htg-card transition-colors">
            Anuluj
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              await onSave(profile.user_id, score, notes);
              setSaving(false);
              onClose();
            }}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-htg-warm/15 hover:bg-htg-warm/25 text-htg-warm
              ring-1 ring-htg-warm/30 text-sm font-medium transition-colors"
          >
            {saving ? 'Zapisuję…' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Group card ───────────────────────────────────────────────────────────────
function GroupCard({ group, index }: { group: GroupProposal; index: number }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-[#0d1220] border border-white/8 rounded-2xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/2 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-htg-warm/15 border border-htg-warm/20
            flex items-center justify-center text-sm font-bold text-htg-warm">
            {index + 1}
          </div>
          <div>
            <p className="text-sm font-semibold text-htg-fg">{group.members.length} uczestników</p>
            <p className="text-xs text-htg-fg-muted">
              {group.stats.newPairs} nowych par · rozpiętość {group.stats.compositeSpread.toFixed(1)} pkt
            </p>
          </div>
        </div>
        {/* Mini score bars */}
        <div className="flex gap-3 items-center">
          <div className="hidden sm:flex gap-2">
            <ScoreBar value={group.stats.d1Spread} color={D1_COLOR} />
            <ScoreBar value={group.stats.d2Avg}    color={D2_COLOR} />
            <ScoreBar value={group.stats.d3Avg}    color={D3_COLOR} />
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-htg-fg-muted/40" /> : <ChevronDown className="w-4 h-4 text-htg-fg-muted/40" />}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Members */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {group.members.map(m => (
              <div key={m.userId} className="flex items-center justify-between
                px-3 py-2.5 rounded-xl bg-white/3 border border-white/5">
                <div>
                  <p className="text-sm font-medium text-htg-fg">{m.displayName}</p>
                  <p className="text-[10px] text-htg-fg-muted/60">{m.email}</p>
                </div>
                <div className="flex flex-col gap-0.5 items-end">
                  <span className="text-[10px] font-mono" style={{ color: D1_COLOR }}>D1:{m.d1.toFixed(1)}</span>
                  <span className="text-[10px] font-mono" style={{ color: D2_COLOR }}>D2:{m.d2.toFixed(1)}</span>
                  <span className="text-[10px] font-mono" style={{ color: D3_COLOR }}>D3:{m.d3.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Explanations */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-htg-fg-muted/60 uppercase tracking-wider mb-2">Dlaczego ta konfiguracja</p>
            {group.explanation.map((ex, i) => (
              <div key={i} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs
                ${ex.type === 'positive' ? 'bg-green-500/8 text-green-300/80' :
                  ex.type === 'warning'  ? 'bg-amber-500/8 text-amber-300/80' :
                                           'bg-white/4 text-white/50'}`}>
                <span className="text-base leading-none mt-0.5 shrink-0">{ex.icon}</span>
                <span>{ex.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main client component ────────────────────────────────────────────────────
export default function ProfilesClient({ isAdmin }: { isAdmin: boolean }) {
  const [profiles,   setProfiles]   = useState<Profile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [sortKey,    setSortKey]    = useState<SortKey>('composite');
  const [sortDir,    setSortDir]    = useState<SortDir>('desc');
  const [mode,       setMode]       = useState<Mode>('table');
  const [proposal,   setProposal]   = useState<GroupingResult | null>(null);
  const [grouping,   setGrouping]   = useState(false);
  const [groupSizeMin, setGroupSizeMin] = useState(4);
  const [groupSizeMax, setGroupSizeMax] = useState(6);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [searchQ,    setSearchQ]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/htg-meeting/profiles');
    if (res.ok) {
      const d = await res.json();
      setProfiles(d.profiles ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const recompute = async () => {
    setRecomputing(true);
    await fetch('/api/htg-meeting/profiles/recompute', { method: 'POST' });
    await load();
    setRecomputing(false);
  };

  const saveD1 = async (userId: string, score: number, notes: string) => {
    await fetch('/api/htg-meeting/profiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, score_merytoryczny_override: score, admin_notes: notes }),
    });
    await load();
  };

  const propose = async (ids: string[]) => {
    setGrouping(true);
    const res = await fetch('/api/htg-meeting/group/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ids, groupSizeMin, groupSizeMax }),
    });
    if (res.ok) {
      setProposal(await res.json());
      setMode('proposal');
    }
    setGrouping(false);
  };

  // Derived
  const filtered = profiles.filter(p =>
    !searchQ || p.display_name.toLowerCase().includes(searchQ.toLowerCase()) ||
    p.email.toLowerCase().includes(searchQ.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name')      return dir * a.display_name.localeCompare(b.display_name);
    if (sortKey === 'd1')        return dir * (a.score_merytoryczny - b.score_merytoryczny);
    if (sortKey === 'd2')        return dir * (a.score_organizacyjny - b.score_organizacyjny);
    if (sortKey === 'd3')        return dir * (a.score_relacyjny - b.score_relacyjny);
    if (sortKey === 'sessions')  return dir * (a.sessions_total - b.sessions_total);
    // composite
    const ca = (a.score_merytoryczny + a.score_organizacyjny + a.score_relacyjny) / 3;
    const cb = (b.score_merytoryczny + b.score_organizacyjny + b.score_relacyjny) / 3;
    return dir * (ca - cb);
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider
        transition-colors ${sortKey === k ? 'text-htg-warm' : 'text-htg-fg-muted/50 hover:text-htg-fg-muted'}`}
    >
      {label}
      {sortKey === k && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
    </button>
  );

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map(p => p.user_id)));
  };

  // ─── Proposal view ────────────────────────────────────────────────────────
  if (mode === 'proposal' && proposal) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode('table')}
            className="flex items-center gap-2 text-htg-fg-muted hover:text-htg-fg text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Powrót do profili
          </button>
        </div>

        {/* Meta summary */}
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-serif font-bold text-htg-fg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-htg-warm" />
                Propozycja grup
              </h2>
              <p className="text-sm text-htg-fg-muted mt-1">
                {proposal.meta.totalUsers} uczestników →{' '}
                {proposal.meta.groupCount} grup po {proposal.meta.groupSizeMin}–{proposal.meta.groupSizeMax} osoby
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <div className="px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                {proposal.meta.totalNewPairs} nowych par
              </div>
              {proposal.meta.totalKnownPairs > 0 && (
                <div className="px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {proposal.meta.totalKnownPairs} znanych par
                </div>
              )}
            </div>
          </div>

          {/* Algorithm info */}
          <div className="mt-4 pt-4 border-t border-htg-card-border flex items-center gap-2 text-xs text-htg-fg-muted/50">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Algorytm: Stratified Snake Distribution v1 — deterministyczny, bez AI.
            Ten sam dobór uczestników zawsze da ten sam wynik.
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 px-1">
          <DimLabel icon={<Star className="w-3 h-3" />}     label="D1 Merytoryczny" color={D1_COLOR} />
          <DimLabel icon={<BarChart2 className="w-3 h-3" />} label="D2 Organizacyjny" color={D2_COLOR} />
          <DimLabel icon={<Heart className="w-3 h-3" />}     label="D3 Relacyjny" color={D3_COLOR} />
        </div>

        {/* Group cards */}
        <div className="space-y-4">
          {proposal.groups.map((g, i) => (
            <GroupCard key={g.id} group={g} index={i} />
          ))}
        </div>

        <button
          onClick={() => { setMode('table'); setProposal(null); }}
          className="w-full py-3 rounded-xl bg-htg-surface text-htg-fg-muted text-sm hover:bg-htg-card transition-colors"
        >
          Wyczyść propozycję i wróć
        </button>
      </div>
    );
  }

  // ─── Table view ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {editProfile && isAdmin && (
        <EditD1Modal profile={editProfile} onSave={saveD1} onClose={() => setEditProfile(null)} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif font-semibold text-htg-fg flex items-center gap-2">
            <Users2 className="w-5 h-5 text-htg-warm" />
            Profile uczestników
          </h2>
          <p className="text-sm text-htg-fg-muted mt-1">
            Dane zebrane ze spotkań HTG. D1 ustawiany ręcznie, D2/D3 obliczane automatycznie.
          </p>
        </div>
        <button
          onClick={recompute}
          disabled={recomputing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-htg-surface hover:bg-htg-card
            text-htg-fg-muted text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${recomputing ? 'animate-spin' : ''}`} />
          {recomputing ? 'Obliczam…' : 'Przelicz D2/D3'}
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 px-1">
        <DimLabel icon={<Star className="w-3 h-3" />}      label="D1 Merytoryczny — jakość treści (ręcznie)" color={D1_COLOR} />
        <DimLabel icon={<BarChart2 className="w-3 h-3" />}  label="D2 Organizacyjny — frekwencja, czas mówienia" color={D2_COLOR} />
        <DimLabel icon={<Heart className="w-3 h-3" />}      label="D3 Relacyjny — moderowanie, nowe relacje" color={D3_COLOR} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Szukaj uczestnika…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          className="px-3 py-2 rounded-xl bg-htg-surface border border-htg-card-border
            text-htg-fg text-sm placeholder:text-htg-fg-muted/40 focus:outline-none
            focus:border-htg-warm/30 w-56"
        />

        <div className="flex items-center gap-1.5 ml-auto text-xs text-htg-fg-muted">
          <span>Rozmiar grupy:</span>
          <input type="number" min={2} max={8} value={groupSizeMin}
            onChange={e => setGroupSizeMin(parseInt(e.target.value) || 4)}
            className="w-12 text-center px-2 py-1 rounded-lg bg-htg-surface border border-htg-card-border text-htg-fg"
          />
          <span>–</span>
          <input type="number" min={2} max={12} value={groupSizeMax}
            onChange={e => setGroupSizeMax(parseInt(e.target.value) || 6)}
            className="w-12 text-center px-2 py-1 rounded-lg bg-htg-surface border border-htg-card-border text-htg-fg"
          />
        </div>

        {selected.size > 0 ? (
          <button
            onClick={() => propose([...selected])}
            disabled={grouping}
            className="flex items-center gap-2 px-4 py-2 rounded-xl
              bg-htg-warm/15 hover:bg-htg-warm/25 text-htg-warm
              ring-1 ring-htg-warm/30 text-sm font-medium transition-colors"
          >
            <Shuffle className={`w-4 h-4 ${grouping ? 'animate-spin' : ''}`} />
            {grouping ? 'Grupuję…' : `Grupuj zaznaczonych (${selected.size})`}
          </button>
        ) : (
          <button
            onClick={() => propose(filtered.map(p => p.user_id))}
            disabled={grouping || filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl
              bg-htg-sage/15 hover:bg-htg-sage/25 text-htg-sage
              ring-1 ring-htg-sage/30 text-sm font-medium transition-colors
              disabled:opacity-40"
          >
            <Shuffle className={`w-4 h-4 ${grouping ? 'animate-spin' : ''}`} />
            {grouping ? 'Grupuję…' : `Grupuj wszystkich (${filtered.length})`}
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-htg-warm border-t-transparent animate-spin" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-12 text-center">
          <Users2 className="w-10 h-10 text-htg-fg-muted/30 mx-auto mb-3" />
          <p className="text-htg-fg-muted text-sm">Brak profili uczestników.</p>
          <p className="text-htg-fg-muted/60 text-xs mt-1">Kliknij "Przelicz D2/D3" żeby wygenerować profile z danych spotkań.</p>
        </div>
      ) : (
        <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid items-center gap-3 px-4 py-3 border-b border-htg-card-border bg-htg-surface/50
            text-[11px] font-semibold uppercase tracking-wider text-htg-fg-muted/50"
            style={{ gridTemplateColumns: '2rem 1fr 9rem 9rem 9rem 9rem 5rem 2.5rem' }}
          >
            <input
              type="checkbox"
              checked={selected.size === sorted.length && sorted.length > 0}
              onChange={toggleAll}
              className="rounded accent-amber-400"
            />
            <SortBtn k="name"      label="Uczestnik" />
            <DimLabel icon={<Star className="w-3 h-3" />}      label="D1" color={D1_COLOR} />
            <DimLabel icon={<BarChart2 className="w-3 h-3" />}  label="D2" color={D2_COLOR} />
            <DimLabel icon={<Heart className="w-3 h-3" />}      label="D3" color={D3_COLOR} />
            <SortBtn k="composite" label="Łącznie" />
            <SortBtn k="sessions"  label="Sesje" />
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-htg-card-border/50">
            {sorted.map(p => {
              const composite = (p.score_merytoryczny + p.score_organizacyjny + p.score_relacyjny) / 3;
              const isSelected = selected.has(p.user_id);
              return (
                <div
                  key={p.user_id}
                  className={`grid items-center gap-3 px-4 py-3.5 transition-colors
                    ${isSelected ? 'bg-htg-warm/5' : 'hover:bg-htg-surface/40'}`}
                  style={{ gridTemplateColumns: '2rem 1fr 9rem 9rem 9rem 9rem 5rem 2.5rem' }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => setSelected(prev => {
                      const n = new Set(prev);
                      if (n.has(p.user_id)) n.delete(p.user_id);
                      else n.add(p.user_id);
                      return n;
                    })}
                    className="rounded accent-amber-400"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-htg-fg truncate">{p.display_name || '—'}</p>
                    <p className="text-xs text-htg-fg-muted/60 truncate">{p.email}</p>
                    {p.admin_notes && (
                      <p className="text-[10px] text-htg-warm/60 truncate mt-0.5">{p.admin_notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <ScoreBar value={p.score_merytoryczny} color={D1_COLOR} />
                    {p.score_merytoryczny_override !== null && (
                      <span className="text-[9px] text-htg-warm/50">ręczna</span>
                    )}
                  </div>
                  <ScoreBar value={p.score_organizacyjny} color={D2_COLOR} />
                  <ScoreBar value={p.score_relacyjny}     color={D3_COLOR} />
                  <div className="flex items-center gap-2">
                    <div className="w-14 h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div className="h-full rounded-full bg-white/30" style={{ width: `${(composite / 10) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono text-htg-fg-muted">{composite.toFixed(1)}</span>
                  </div>
                  <div className="text-xs text-htg-fg-muted text-center">
                    <span className="font-medium text-htg-fg">{p.sessions_completed}</span>
                    <span className="text-htg-fg-muted/50">/{p.sessions_total}</span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setEditProfile(p)}
                      className="p-1.5 rounded-lg hover:bg-htg-surface text-htg-fg-muted/40
                        hover:text-htg-warm transition-colors"
                      title="Edytuj D1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer summary */}
          <div className="px-4 py-2.5 border-t border-htg-card-border bg-htg-surface/30 text-xs text-htg-fg-muted/50">
            {sorted.length} uczestników · {selected.size > 0 && `${selected.size} zaznaczonych · `}
            {profiles.length > 0 && profiles[0].last_computed_at &&
              `D2/D3 obliczone: ${new Date(profiles[0].last_computed_at).toLocaleString('pl-PL')}`
            }
          </div>
        </div>
      )}
    </div>
  );
}
