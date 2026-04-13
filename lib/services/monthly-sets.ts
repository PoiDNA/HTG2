import { createSupabaseServer } from '@/lib/supabase/server';
import { pickLocale } from '@/lib/utils/pick-locale';

export interface SessionTemplate {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  thumbnail_url: string | null;
  category?: string | null;
  tags?: string[];
  view_count?: number;
}

export interface MonthlySet {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  month_label: string | null;
  cover_image_url: string | null;
  sessions: SessionTemplate[];
}

/**
 * Fetch all published monthly sets with their sessions, sorted newest first.
 * Titles and descriptions are resolved for the given locale (falls back to 'pl').
 */
export async function getMonthlySets(locale = 'pl'): Promise<MonthlySet[]> {
  const supabase = await createSupabaseServer();

  const { data: sets, error } = await supabase
    .from('monthly_sets')
    .select(`
      id, slug, title, title_i18n, description, description_i18n, month_label, cover_image_url,
      set_sessions (
        sort_order,
        session:session_templates (
          id, slug, title, title_i18n, description, description_i18n,
          duration_minutes, thumbnail_url, category, tags, view_count
        )
      )
    `)
    .eq('is_published', true)
    .order('month_label', { ascending: false });

  if (error || !sets) return [];

  return sets.map((set: any) => ({
    ...set,
    title: pickLocale(set.title_i18n, locale, set.title),
    description: pickLocale(set.description_i18n, locale, set.description) || null,
    sessions: (set.set_sessions || [])
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((ss: any) => ss.session)
      .filter(Boolean)
      .map((s: any) => ({
        ...s,
        title: pickLocale(s.title_i18n, locale, s.title),
        description: pickLocale(s.description_i18n, locale, s.description) || null,
      })),
  }));
}
