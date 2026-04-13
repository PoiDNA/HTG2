import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

/**
 * POST /api/admin/translation-issues/:id
 * Body: { action: 'resolve' | 'reject' }
 * Updates the status of a translation issue.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin();
  if ('error' in result) return result.error;
  const { supabase, user } = result;

  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (!['resolve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { error } = await supabase
    .from('translation_issues')
    .update({
      status: action === 'resolve' ? 'resolved' : 'rejected',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
