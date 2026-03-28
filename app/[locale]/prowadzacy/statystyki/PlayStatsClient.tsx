'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Play, Users, Clock, TrendingUp, BarChart2, ChevronDown, ChevronUp,
  Video, Mic, RefreshCw, X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  vod: { plays30d: number; plays7d: number; uniqueUsers30d: number; totalHours30d: number };
  recordings: { plays30d: number; plays7d: number; uniqueUsers30d: number; totalHours30d: number };
}

interface VodSession {
  sessionId: string;
  title: string;
  plays: number;
  uniqueUsers: number;
  avgMinutes: number;
}

interface RecordingRow {
  recordingId: string;
  type: 'before' | 'after';
  format: 'video' | 'audio';
  createdAt: string;
  durationSeconds: number;
  plays: number;
  uniqueUsers: number;
  avgSeconds: number;
}

interface RetentionBucket {
  position: number;
  count: number;
  pct: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('pl-PL');
}

function fmtMin(m: number) {
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}min`;
}

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─── Retention SVG chart ─────────────────────────────────────────────────────

function RetentionChart({ buckets, totalDuration }: { buckets: RetentionBucket[]; totalDuration: number }) {
  if (!buckets.length) return (
    <div className="h-32 flex items-center justify-center text-htg-fg-muted text-sm">
      Brak danych — trwa zbieranie pozycji odtwarzania
    </div>
  );

  const W = 600; const H = 140;
  const padL = 36; const padB = 24; const padT = 12; const padR = 12;
  const chartW = W - padL - padR;
  const chartH = H - padB - padT;

  // Build SVG path
  const pts = buckets.map((b, i) => {
    const x = padL + (i / Math.max(buckets.length - 1, 1)) * chartW;
    const y = padT + chartH - (b.pct / 100) * chartH;
    return [x, y] as [number, number];
  });

  // Smooth path using cubic bezier
  function buildPath(pts: [number, number][]): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const cp1x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * 0.4;
      const cp1y = pts[i - 1][1];
      const cp2x = pts[i][0] - (pts[i][0] - pts[i - 1][0]) * 0.4;
      const cp2y = pts[i][1];
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
    }
    return d;
  }

  const linePath = buildPath(pts);
  const areaPath = pts.length > 0
    ? `${linePath} L ${pts[pts.length - 1][0].toFixed(1)},${(padT + chartH).toFixed(1)} L ${pts[0][0].toFixed(1)},${(padT + chartH).toFixed(1)} Z`
    : '';

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100];

  // X-axis: format time labels
  function fmtPos(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (s === 0) return '0:00';
    if (sec === 0) return `${m}:00`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // Show ~5 time labels
  const xLabelStep = Math.ceil(buckets.length / 5);
  const xLabels = buckets.filter((_, i) => i % xLabelStep === 0 || i === buckets.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yLabels.map(pct => {
        const y = padT + chartH - (pct / 100) * chartH;
        return (
          <g key={pct}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.35)">{pct}%</text>
          </g>
        );
      })}

      {/* Area fill */}
      {areaPath && <path d={areaPath} fill="url(#retGrad)" />}

      {/* Line */}
      {linePath && <path d={linePath} fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" />}

      {/* X-axis labels */}
      {xLabels.map((b) => {
        const i = buckets.indexOf(b);
        const x = padL + (i / Math.max(buckets.length - 1, 1)) * chartW;
        return (
          <text key={b.position} x={x} y={H - 4} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)">
            {fmtPos(b.position)}
          </text>
        );
      })}

      {/* Baseline */}
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
    </svg>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Play; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-2xl font-bold text-htg-fg">{value}</p>
      <p className="text-sm text-htg-fg-muted mt-0.5">{label}</p>
      {sub && <p className="text-xs text-htg-fg-muted/60 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Tab = 'vod' | 'recordings';

export default function PlayStatsClient() {
  const [tab, setTab] = useState<Tab>('vod');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [vodSessions, setVodSessions] = useState<VodSession[]>([]);
  const [recordingRows, setRecordingRows] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [retentionSession, setRetentionSession] = useState<{ id: string; title: string } | null>(null);
  const [retention, setRetention] = useState<{ buckets: RetentionBucket[]; totalViewers: number; totalDuration: number } | null>(null);
  const [retLoading, setRetLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, vodRes, recRes] = await Promise.all([
        fetch('/api/analytics/stats?type=summary'),
        fetch('/api/analytics/stats?type=vod_list'),
        fetch('/api/analytics/stats?type=recordings_list'),
      ]);
      const [sumData, vodData, recData] = await Promise.all([sumRes.json(), vodRes.json(), recRes.json()]);
      setSummary(sumData);
      setVodSessions(vodData.sessions ?? []);
      setRecordingRows(recData.recordings ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadRetention(sessionId: string, title: string) {
    setRetentionSession({ id: sessionId, title });
    setRetention(null);
    setRetLoading(true);
    try {
      const res = await fetch(`/api/analytics/stats?type=retention&sessionId=${sessionId}`);
      const data = await res.json();
      setRetention(data);
    } catch {
      // ignore
    } finally {
      setRetLoading(false);
    }
  }

  const totalPlays = summary ? summary.vod.plays30d + summary.recordings.plays30d : 0;
  const totalUsers = summary ? summary.vod.uniqueUsers30d + summary.recordings.uniqueUsers30d : 0;
  const totalHours = summary ? summary.vod.totalHours30d + summary.recordings.totalHours30d : 0;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-semibold text-htg-fg flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-htg-sage" />
            Statystyki odtworzeń
          </h2>
          <p className="text-sm text-htg-fg-muted mt-0.5">Ostatnie 30 dni — VOD, sesje indywidualne, nagrania przed/po</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-htg-card-border text-htg-fg-muted hover:text-htg-fg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Odśwież
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Play}
          label="Odtworzeń (30d)"
          value={loading ? '...' : fmt(totalPlays)}
          sub={`+${summary?.vod.plays7d ?? 0 + (summary?.recordings.plays7d ?? 0)} w ost. 7 dni`}
          color="bg-htg-sage"
        />
        <StatCard
          icon={Users}
          label="Unikalnych słuchaczy"
          value={loading ? '...' : fmt(totalUsers)}
          sub="30 dni"
          color="bg-htg-indigo"
        />
        <StatCard
          icon={Clock}
          label="Godzin odsłuchanych"
          value={loading ? '...' : `${totalHours}h`}
          sub="łącznie 30 dni"
          color="bg-htg-warm"
        />
        <StatCard
          icon={TrendingUp}
          label="Sesje VOD"
          value={loading ? '...' : fmt(vodSessions.length)}
          sub="z odtworzeniami"
          color="bg-purple-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-htg-surface rounded-xl border border-htg-card-border w-fit">
        <button
          onClick={() => setTab('vod')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'vod' ? 'bg-htg-sage text-white' : 'text-htg-fg-muted hover:text-htg-fg'
          }`}
        >
          <Video className="w-4 h-4" />
          Sesje VOD
          <span className={`text-xs px-1.5 py-0.5 rounded ${tab === 'vod' ? 'bg-white/20' : 'bg-htg-card text-htg-fg-muted'}`}>
            {summary?.vod.plays30d ?? 0}
          </span>
        </button>
        <button
          onClick={() => setTab('recordings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'recordings' ? 'bg-htg-indigo text-white' : 'text-htg-fg-muted hover:text-htg-fg'
          }`}
        >
          <Mic className="w-4 h-4" />
          Nagrania przed/po
          <span className={`text-xs px-1.5 py-0.5 rounded ${tab === 'recordings' ? 'bg-white/20' : 'bg-htg-card text-htg-fg-muted'}`}>
            {summary?.recordings.plays30d ?? 0}
          </span>
        </button>
      </div>

      {/* VOD sessions table */}
      {tab === 'vod' && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-htg-card-border">
            <p className="text-sm font-medium text-htg-fg">Sesje według odtworzeń (30 dni)</p>
            <p className="text-xs text-htg-fg-muted mt-0.5">Kliknij wiersz → wykres retencji</p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-htg-fg-muted text-sm">Ładowanie...</div>
          ) : vodSessions.length === 0 ? (
            <div className="p-8 text-center text-htg-fg-muted text-sm">
              Brak danych — odtworzenia pojawią się tu po pierwszym odtworzeniu przez użytkownika
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-htg-card-border text-xs text-htg-fg-muted">
                    <th className="text-left px-4 py-2 font-medium">Sesja</th>
                    <th className="text-right px-4 py-2 font-medium">Odtw.</th>
                    <th className="text-right px-4 py-2 font-medium">Unikalnych</th>
                    <th className="text-right px-4 py-2 font-medium">Śr. czas</th>
                    <th className="text-right px-4 py-2 font-medium">Wykres</th>
                  </tr>
                </thead>
                <tbody>
                  {vodSessions.map((s) => (
                    <tr
                      key={s.sessionId}
                      className="border-b border-htg-card-border/50 hover:bg-htg-surface/50 cursor-pointer transition-colors"
                      onClick={() => loadRetention(s.sessionId, s.title)}
                    >
                      <td className="px-4 py-3 text-htg-fg font-medium truncate max-w-xs">{s.title}</td>
                      <td className="px-4 py-3 text-right text-htg-fg">{fmt(s.plays)}</td>
                      <td className="px-4 py-3 text-right text-htg-fg-muted">{fmt(s.uniqueUsers)}</td>
                      <td className="px-4 py-3 text-right text-htg-fg-muted">{fmtMin(s.avgMinutes)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-htg-sage hover:underline">
                          <BarChart2 className="w-3 h-3" />
                          Retencja
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Recordings table */}
      {tab === 'recordings' && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-htg-card-border">
            <p className="text-sm font-medium text-htg-fg">Nagrania klientów przed/po sesji</p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-htg-fg-muted text-sm">Ładowanie...</div>
          ) : recordingRows.length === 0 ? (
            <div className="p-8 text-center text-htg-fg-muted text-sm">
              Brak danych — odtworzenia pojawią się tu po pierwszym odtworzeniu nagrania
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-htg-card-border text-xs text-htg-fg-muted">
                    <th className="text-left px-4 py-2 font-medium">Nagranie</th>
                    <th className="text-left px-4 py-2 font-medium">Typ</th>
                    <th className="text-right px-4 py-2 font-medium">Długość</th>
                    <th className="text-right px-4 py-2 font-medium">Odtw.</th>
                    <th className="text-right px-4 py-2 font-medium">Unikalnych</th>
                    <th className="text-right px-4 py-2 font-medium">Śr. czas</th>
                  </tr>
                </thead>
                <tbody>
                  {recordingRows.map((r) => (
                    <tr key={r.recordingId} className="border-b border-htg-card-border/50 text-htg-fg">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.format === 'video'
                            ? <Video className="w-3.5 h-3.5 text-htg-sage shrink-0" />
                            : <Mic className="w-3.5 h-3.5 text-htg-indigo shrink-0" />
                          }
                          <span className="text-xs text-htg-fg-muted font-mono">{r.recordingId.slice(0, 8)}</span>
                          {r.createdAt && (
                            <span className="text-xs text-htg-fg-muted">
                              {new Date(r.createdAt).toLocaleDateString('pl-PL')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.type === 'before' ? 'bg-blue-900/30 text-blue-300' : 'bg-purple-900/30 text-purple-300'
                        }`}>
                          {r.type === 'before' ? 'Przed sesją' : 'Po sesji'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-htg-fg-muted text-xs">{r.durationSeconds ? fmtSec(r.durationSeconds) : '—'}</td>
                      <td className="px-4 py-3 text-right">{fmt(r.plays)}</td>
                      <td className="px-4 py-3 text-right text-htg-fg-muted">{fmt(r.uniqueUsers)}</td>
                      <td className="px-4 py-3 text-right text-htg-fg-muted text-xs">{r.avgSeconds ? fmtSec(r.avgSeconds) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Retention modal */}
      {retentionSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-htg-card border border-htg-card-border rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-htg-card-border">
              <div>
                <p className="text-sm font-semibold text-htg-fg flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-htg-sage" />
                  Retencja odtwarzania
                </p>
                <p className="text-xs text-htg-fg-muted mt-0.5 truncate max-w-sm">{retentionSession.title}</p>
              </div>
              <button
                onClick={() => setRetentionSession(null)}
                className="p-1.5 rounded-lg hover:bg-htg-surface text-htg-fg-muted hover:text-htg-fg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {retLoading ? (
                <div className="h-32 flex items-center justify-center text-htg-fg-muted text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  Ładowanie danych retencji...
                </div>
              ) : retention ? (
                <>
                  {/* Stats row */}
                  <div className="flex gap-4 mb-4 text-sm">
                    <div className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2">
                      <p className="text-xs text-htg-fg-muted">Sesji odtwarzania</p>
                      <p className="font-bold text-htg-fg">{fmt(retention.totalViewers)}</p>
                    </div>
                    <div className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2">
                      <p className="text-xs text-htg-fg-muted">Długość materiału</p>
                      <p className="font-bold text-htg-fg">{fmtMin(Math.round(retention.totalDuration / 60))}</p>
                    </div>
                    {retention.buckets.length > 0 && (
                      <div className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2">
                        <p className="text-xs text-htg-fg-muted">Śr. retencja</p>
                        <p className="font-bold text-htg-sage">
                          {Math.round(retention.buckets.reduce((a, b) => a + b.pct, 0) / retention.buckets.length)}%
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Chart */}
                  <div className="bg-htg-bg/60 border border-htg-card-border rounded-xl p-4">
                    <p className="text-xs text-htg-fg-muted mb-3">
                      Procent słuchaczy nadal odtwarzających w danym momencie
                    </p>
                    <RetentionChart buckets={retention.buckets} totalDuration={retention.totalDuration} />
                  </div>

                  <p className="text-xs text-htg-fg-muted/60 mt-3 text-center">
                    Dane zbierane co 30 sekund podczas odtwarzania przez użytkowników
                  </p>
                </>
              ) : (
                <div className="h-32 flex items-center justify-center text-htg-fg-muted text-sm">
                  Brak danych retencji dla tej sesji
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
