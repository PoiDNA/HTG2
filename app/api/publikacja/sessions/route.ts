import { NextRequest, NextResponse } from 'next/server';
import { requirePublication } from '@/lib/publication/auth';

export async function GET(request: NextRequest) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;

  const params = request.nextUrl.searchParams;
  const month = params.get('month');
  const status = params.get('status');
  const assignedTo = params.get('assigned_to');

  let query = supabase
    .from('session_publications')
    .select(`
      *,
      monthly_set:monthly_sets(id, title, month),
      assigned_editor:profiles!session_publications_assigned_editor_id_fkey(id, email, display_name)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  // Non-admin editors: only see assigned or unassigned sessions
  if (!isAdmin) {
    query = query.or(`assigned_editor_id.eq.${user.id},assigned_editor_id.is.null`);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (assignedTo) {
    query = query.eq('assigned_editor_id', assignedTo);
  }

  if (month) {
    // month format: YYYY-MM
    const startDate = `${month}-01`;
    const [year, mon] = month.split('-').map(Number);
    const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
    query = query.gte('created_at', startDate).lt('created_at', nextMonth);
  }

  const { data: sessions, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions });
}
