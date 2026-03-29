import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';
import { checkCommunityRateLimit, logCommunityAction } from '@/lib/community/rate-limit';

/**
 * POST /api/community/reports
 *
 * Report a post or comment.
 * Body: { target_type: 'post'|'comment', target_id: uuid, reason?: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { target_type, target_id, reason } = body;

  if (!target_type || !target_id || !['post', 'comment'].includes(target_type)) {
    return NextResponse.json({ error: 'target_type and target_id are required' }, { status: 400 });
  }

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Rate limit
  const rateLimited = await checkCommunityRateLimit(user.id, 'report');
  if (rateLimited) {
    return NextResponse.json({ error: 'Rate limit exceeded. Max 5 reports per hour.' }, { status: 429 });
  }

  // Get group_id from target
  let groupId: string | null = null;
  if (target_type === 'post') {
    const { data } = await supabase.from('community_posts').select('group_id').eq('id', target_id).single();
    groupId = data?.group_id ?? null;
  } else {
    const { data } = await supabase.from('community_comments').select('group_id').eq('id', target_id).single();
    groupId = data?.group_id ?? null;
  }

  const { data: report, error } = await supabase
    .from('community_reports')
    .insert({
      reporter_id: user.id,
      target_type,
      target_id,
      group_id: groupId,
      reason: reason || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You have already reported this content' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
  }

  await logCommunityAction(user.id, 'report');

  return NextResponse.json(report, { status: 201 });
}

/**
 * GET /api/community/reports?status=pending
 *
 * List reports. Admin/staff only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  if (!auth.isAdmin && !auth.isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get('status') || 'pending';

  const { data: reports, error } = await auth.supabase
    .from('community_reports')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }

  return NextResponse.json(reports);
}
