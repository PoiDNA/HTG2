import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { resolveStaffPlaybackScope } from '@/lib/admin/require-playback-actor';

/**
 * GET /api/admin/users/search?q=<query>
 * Returns up to 10 profiles matching q by email OR display_name.
 * Auth: admin, practitioner, or assistant (via resolveStaffPlaybackScope).
 * No fallback to STAFF_EMAILS — single source of truth.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const scope = await resolveStaffPlaybackScope(user, db);
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rawQ = req.nextUrl.searchParams.get('q')?.trim() || '';
  if (rawQ.length < 2) return NextResponse.json([]);

  // Strip LIKE wildcards (% _) and PostgREST filter special chars (, ( ))
  // to prevent both over-broad matching and filter injection.
  const q = rawQ.replace(/[,()%_]/g, '').slice(0, 100);
  if (q.length < 2) return NextResponse.json([]);

  // Two separate ilike queries merged in app code — safer than .or() with
  // string interpolation (which would expose PostgREST filter injection).
  const [byEmail, byName] = await Promise.all([
    db
      .from('profiles')
      .select('id, email, display_name')
      .ilike('email', `%${q}%`)
      .order('email')
      .limit(10),
    db
      .from('profiles')
      .select('id, email, display_name')
      .ilike('display_name', `%${q}%`)
      .order('display_name')
      .limit(10),
  ]);

  const seen = new Set<string>();
  const merged: Array<{ id: string; email: string; display_name: string | null }> = [];
  for (const row of [...(byEmail.data || []), ...(byName.data || [])]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
    if (merged.length >= 10) break;
  }

  return NextResponse.json(merged);
}
