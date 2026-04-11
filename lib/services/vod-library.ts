import type { SupabaseClient } from '@supabase/supabase-js';
import { formatSesjeMonthPl } from '@/lib/booking/constants';

export type VodSession = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  isPlayable: boolean;
};

export type MonthSection = {
  title: string;
  monthLabel: string;
  coverImageUrl: string | null;
  sessions: VodSession[];
};

export type VodLibraryData = {
  sections: MonthSection[];
  singleSessions: VodSession[];
  futureMonthsCount: number;
};

export async function buildVodLibrary(
  supabase: SupabaseClient,
  userId: string
): Promise<VodLibraryData> {
  // 1. Fetch active entitlements
  const { data: rawEntitlements } = await supabase
    .from('entitlements')
    .select('id, type, scope_month, monthly_set_id, session_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString());

  const entitlements = rawEntitlements || [];

  // 2. Gather keys
  const setIds = [...new Set(
    entitlements.filter(e => e.monthly_set_id).map(e => e.monthly_set_id!)
  )];
  const fallbackMonths = [...new Set(
    entitlements
      .filter(e => e.scope_month && !e.monthly_set_id)
      .map(e => e.scope_month!)
  )];
  const singleSessionIds = entitlements
    .filter(e => e.type === 'session' && e.session_id)
    .map(e => e.session_id!);

  // 3. Fetch monthly_sets by ID
  let setsByIdResults: any[] = [];
  if (setIds.length > 0) {
    const { data } = await supabase
      .from('monthly_sets')
      .select(`
        id, title, month_label, cover_image_url,
        set_sessions (
          sort_order,
          session:session_templates (
            id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id
          )
        )
      `)
      .in('id', setIds)
      .eq('is_published', true)
      .order('month_label', { ascending: false });
    setsByIdResults = data || [];
  }

  // 4. Fetch fallback monthly_sets by month_label
  const alreadyCovered = new Set(setsByIdResults.map(s => s.month_label));
  const missing = fallbackMonths.filter(m => !alreadyCovered.has(m));

  let setsByMonthResults: any[] = [];
  if (missing.length > 0) {
    const { data } = await supabase
      .from('monthly_sets')
      .select(`
        id, title, month_label, cover_image_url,
        set_sessions (
          sort_order,
          session:session_templates (
            id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id
          )
        )
      `)
      .in('month_label', missing)
      .eq('is_published', true)
      .order('month_label', { ascending: false });
    setsByMonthResults = data || [];
  }

  const allSets = [...setsByIdResults, ...setsByMonthResults];

  // 5. Fetch single sessions
  const monthlySessionIds = new Set(
    allSets.flatMap(s => (s.set_sessions || []).map((ss: any) => ss.session?.id).filter(Boolean))
  );
  const uniqueSingleIds = singleSessionIds.filter(id => !monthlySessionIds.has(id));

  let rawSingleSessions: any[] = [];
  if (uniqueSingleIds.length > 0) {
    const { data } = await supabase
      .from('session_templates')
      .select('id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id')
      .in('id', uniqueSingleIds)
      .not('bunny_video_id', 'is', null);
    rawSingleSessions = data || [];
  }

  // 6. Build sections
  const sections: MonthSection[] = [];

  for (const set of allSets) {
    const sessions = (set.set_sessions || [])
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((ss: any) => ss.session)
      .filter((s: any) => s && s.bunny_video_id);
    
    // Deduplicate only WITHIN the section
    const unique = [...new Map(sessions.map((s: any) => [s.id, s])).values()] as any[];
    if (unique.length > 0) {
      sections.push({
        title: set.title,
        monthLabel: set.month_label,
        coverImageUrl: set.cover_image_url || null,
        sessions: unique.map(s => ({
          id: s.id,
          title: s.title,
          description: s.description,
          durationMinutes: s.duration_minutes,
          isPlayable: !!s.bunny_video_id
        }))
      });
    }
  }

  // Placeholders for current and past months without sets
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const allEntitledMonths = [...new Set(
    entitlements.filter(e => e.scope_month).map(e => e.scope_month!)
  )];
  const coveredMonths = new Set(sections.map(s => s.monthLabel));
  const missingCurrentOrPast = allEntitledMonths.filter(m => !coveredMonths.has(m) && m <= currentMonth);

  for (const sm of missingCurrentOrPast) {
    sections.push({ title: formatSesjeMonthPl(sm), monthLabel: sm, coverImageUrl: null, sessions: [] });
  }

  // Sort sections descending by monthLabel
  sections.sort((a, b) => b.monthLabel.localeCompare(a.monthLabel));

  // Future months notice
  const futureMonthsCount = allEntitledMonths.filter(m => !coveredMonths.has(m) && m > currentMonth).length;

  return {
    sections,
    singleSessions: rawSingleSessions.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      durationMinutes: s.duration_minutes,
      isPlayable: !!s.bunny_video_id
    })),
    futureMonthsCount
  };
}