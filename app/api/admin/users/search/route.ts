import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/admin/users/search?q=email
 * Returns up to 10 profiles matching the email query (admin only).
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const q = req.nextUrl.searchParams.get('q')?.trim() || '';
  if (q.length < 2) return NextResponse.json([]);

  const { data } = await db
    .from('profiles')
    .select('id, email, display_name')
    .ilike('email', `%${q}%`)
    .order('email')
    .limit(10);

  return NextResponse.json(data || []);
}
