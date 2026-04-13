import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Link } from '@/i18n-config';
import { Play, Clock } from 'lucide-react';

interface ResumeItem {
  sessionId: string;
  title: string;
  positionSeconds: number;
  totalDurationSeconds: number;
  progressPercent: number;
  updatedAt: string;
}

/**
 * V3 "Sanctum" Continue Card — shows one main resume + 2-3 secondary items.
 * Server component.
 */
export default async function ContinueCard({ locale }: { locale: string }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch recent playback positions
  const db = createSupabaseServiceRole();
  const { data: positions } = await db
    .from('playback_positions')
    .select('session_id, position_seconds, total_duration_seconds, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!positions || positions.length === 0) return null;

  // Deduplicate: keep latest per session_id
  const latestBySession = new Map<string, typeof positions[0]>();
  for (const pos of positions) {
    if (!latestBySession.has(pos.session_id)) {
      latestBySession.set(pos.session_id, pos);
    }
  }

  // Filter: >5% and <90% progress, duration >10min
  const resumeItems: ResumeItem[] = [];
  for (const [sessionId, pos] of latestBySession) {
    if (!pos.total_duration_seconds || pos.total_duration_seconds < 600) continue; // <10min skip
    const percent = (pos.position_seconds / pos.total_duration_seconds) * 100;
    if (percent <= 5 || percent >= 90) continue;

    resumeItems.push({
      sessionId,
      title: sessionId, // Will be enriched below
      positionSeconds: pos.position_seconds,
      totalDurationSeconds: pos.total_duration_seconds,
      progressPercent: Math.round(percent),
      updatedAt: pos.created_at,
    });
  }

  if (resumeItems.length === 0) return null;

  // Sort by most recent
  resumeItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // Enrich with session titles from session_templates
  const sessionIds = resumeItems.map(r => r.sessionId);
  const { data: sessions } = await db
    .from('session_templates')
    .select('id, title')
    .in('id', sessionIds);

  const titleMap = new Map((sessions ?? []).map(s => [s.id, s.title]));
  for (const item of resumeItems) {
    item.title = titleMap.get(item.sessionId) ?? `Sesja`;
  }

  const mainItem = resumeItems[0];
  const secondaryItems = resumeItems.slice(1, 4);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    return `${m} min`;
  }

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wider mb-4">
        Kontynuuj
      </h2>

      {/* Main resume card */}
      <Link
        href="/konto"
        className="block bg-htg-card border border-htg-card-border rounded-xl p-5 hover:border-htg-warm/30 transition-colors group mb-3"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-htg-fg truncate group-hover:text-htg-warm transition-colors">
              {mainItem.title}
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-htg-fg-muted">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(mainItem.positionSeconds)} / {formatTime(mainItem.totalDurationSeconds)}
              </span>
              <span>{mainItem.progressPercent}%</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1 bg-htg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-htg-warm rounded-full transition-all"
                style={{ width: `${mainItem.progressPercent}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 w-10 h-10 rounded-full bg-htg-warm/10 flex items-center justify-center group-hover:bg-htg-warm/20 transition-colors">
            <Play className="w-4 h-4 text-htg-warm" />
          </div>
        </div>
      </Link>

      {/* Secondary items */}
      {secondaryItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {secondaryItems.map((item) => (
            <Link
              key={item.sessionId}
              href="/konto"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors group"
            >
              <Play className="w-3 h-3 shrink-0 text-htg-fg-muted group-hover:text-htg-warm" />
              <span className="flex-1 truncate">{item.title}</span>
              <span className="text-xs">{item.progressPercent}%</span>
              <div className="w-12 h-0.5 bg-htg-surface rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-htg-warm/50 rounded-full"
                  style={{ width: `${item.progressPercent}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
