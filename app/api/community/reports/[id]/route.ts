import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * PATCH /api/community/reports/[id]
 *
 * Update report status. Admin/staff only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  if (!auth.isAdmin && !auth.isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { status } = body;

  if (!status || !['reviewed', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data: report, error } = await auth.supabase
    .from('community_reports')
    .update({
      status,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }

  return NextResponse.json(report);
}
