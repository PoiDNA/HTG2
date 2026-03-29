import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

// GET — fetch user's own requests (or all for admin)
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = isAdminEmail(user.email ?? '');
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  // Always use service role to bypass RLS issues
  const db = createSupabaseServiceRole();

  if (isAdmin) {
    // Admin sees all requests — fetch profiles separately to avoid FK join issues
    let query = db
      .from('account_update_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);
    const { data: requests, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with user profiles
    if (requests && requests.length > 0) {
      const userIds = [...new Set(requests.map(r => r.user_id))];
      const { data: profiles } = await db
        .from('profiles')
        .select('id, email, display_name')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const enriched = requests.map(r => ({
        ...r,
        profiles: profileMap.get(r.user_id) || null,
      }));
      return NextResponse.json(enriched);
    }
    return NextResponse.json(requests || []);
  }

  // Regular user sees own requests
  const { data, error } = await db
    .from('account_update_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST — create new request
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { category, description, purchase_date, proof_url, proof_filename } = body;

  if (!category || !description) {
    return NextResponse.json({ error: 'Category and description are required' }, { status: 400 });
  }

  // Use service role to bypass RLS for insert
  const db = createSupabaseServiceRole();
  const { data, error } = await db
    .from('account_update_requests')
    .insert({
      user_id: user.id,
      category,
      description,
      purchase_date: purchase_date || null,
      proof_url: proof_url || null,
      proof_filename: proof_filename || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH — admin approve/reject
export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const { id, status: newStatus, admin_notes } = body;

  if (!id || !['approved', 'rejected'].includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();
  const { data, error } = await db
    .from('account_update_requests')
    .update({
      status: newStatus,
      admin_notes: admin_notes || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
