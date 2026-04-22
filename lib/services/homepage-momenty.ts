import { createSupabaseServiceRole } from '@/lib/supabase/service';

export interface HomepageMoment {
  id: string;
  title: string;
  start_sec: number;
  end_sec: number;
  session_title: string;
  session_slug: string;
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = seededRandom(seed);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Returns 3–5 impulse fragments, rotated weekly using a deterministic seed.
 * Uses service role — fragments are from published sessions, no auth needed.
 */
export async function getHomepageMomenty(count = 4): Promise<HomepageMoment[]> {
  const db = createSupabaseServiceRole();

  const { data } = await db
    .from('session_fragments')
    .select(`
      id, title, title_i18n, start_sec, end_sec,
      session_templates!inner (
        id, title, slug
      )
    `)
    .eq('is_impulse', true)
    .limit(80);

  if (!data || data.length === 0) return [];

  const moments: HomepageMoment[] = data
    .filter((f: any) => f.session_templates)
    .map((f: any) => {
      const st = Array.isArray(f.session_templates)
        ? f.session_templates[0]
        : f.session_templates;
      const title =
        (f.title_i18n as Record<string, string> | null)?.pl ||
        f.title ||
        '';
      return {
        id: f.id as string,
        title,
        start_sec: f.start_sec as number,
        end_sec: f.end_sec as number,
        session_title: st?.title ?? '',
        session_slug: st?.slug ?? '',
      };
    });

  // Rotate selection weekly
  const weekSeed = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const shuffled = seededShuffle(moments, weekSeed);
  return shuffled.slice(0, count);
}
