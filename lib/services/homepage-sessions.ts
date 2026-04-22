import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { pickLocale } from '@/lib/utils/pick-locale';

export interface HomepageSession {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  thumbnail_url: string | null;
}

/**
 * Returns three sessions from the latest published monthly set:
 * [first, penultimate, last].
 * Falls back to fewer items if the set has < 3 sessions.
 */
export async function getHomePageSessions(locale = 'pl'): Promise<HomepageSession[]> {
  const db = createSupabaseServiceRole();

  const { data: sets } = await db
    .from('monthly_sets')
    .select(`
      id,
      set_sessions (
        sort_order,
        session:session_templates (
          id, slug, title, title_i18n, description, description_i18n,
          duration_minutes, thumbnail_url
        )
      )
    `)
    .eq('is_published', true)
    .order('month_label', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sets) return [];

  const sessions: HomepageSession[] = (sets.set_sessions || [])
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((ss: any) => ss.session)
    .filter(Boolean)
    .map((s: any) => ({
      id: s.id,
      slug: s.slug,
      title: pickLocale(s.title_i18n, locale, s.title),
      description: pickLocale(s.description_i18n, locale, s.description) || null,
      duration_minutes: s.duration_minutes,
      thumbnail_url: s.thumbnail_url,
    }));

  if (sessions.length === 0) return [];
  if (sessions.length === 1) return [sessions[0]];
  if (sessions.length === 2) return [sessions[0], sessions[1]];

  const n = sessions.length;
  // first, penultimate, last — deduplicate if n === 3 (already unique)
  const picks = [sessions[0], sessions[n - 2], sessions[n - 1]];
  // Remove duplicates (n===2 handled above; n===3 all unique)
  return picks;
}
