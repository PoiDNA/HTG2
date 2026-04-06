import { createSupabaseServer } from '@/lib/supabase/server';

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
 */
export async function getMonthlySets(): Promise<MonthlySet[]> {
  const supabase = await createSupabaseServer();

  const { data: sets, error } = await supabase
    .from('monthly_sets')
    .select(`
      id, slug, title, description, month_label, cover_image_url,
      set_sessions (
        sort_order,
        session:session_templates ( id, slug, title, description, duration_minutes, thumbnail_url, category, tags, view_count )
      )
    `)
    .eq('is_published', true)
    .order('month_label', { ascending: false });

  if (error || !sets) return [];

  return sets.map((set: any) => ({
    ...set,
    sessions: (set.set_sessions || [])
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((ss: any) => ss.session)
      .filter(Boolean),
  }));
}
