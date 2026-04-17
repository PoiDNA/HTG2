import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * DELETE /api/fragments/shares/[shareId]
 * Revoke a share (owner only). Sets revoked_at = now().
 */

type Params = { params: Promise<{ shareId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { shareId } = await params;

  const { error } = await supabase
    .from('category_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('owner_user_id', user.id)
    .is('revoked_at', null);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }
    console.error('[shares] DELETE failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
