import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/admin/search-users?q=<email fragment>
 * Returns up to 10 users matching the query (admin only).
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check admin role
  const db = createSupabaseServiceRole();
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  // List users and filter — Supabase admin.listUsers doesn't support server-side search,
  // so we pull pages and filter client-side (acceptable for typical user base size).
  let allUsers: { id: string; email: string }[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users?.length) break;
    allUsers = allUsers.concat(users.map(u => ({ id: u.id, email: u.email ?? '' })));
    if (users.length < 1000) break;
    page++;
  }

  const lower = q.toLowerCase();
  const matches = allUsers
    .filter(u => u.email.toLowerCase().includes(lower))
    .slice(0, 10)
    .map(u => ({ id: u.id, email: u.email }));

  return NextResponse.json(matches);
}
