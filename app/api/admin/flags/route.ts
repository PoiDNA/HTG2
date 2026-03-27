import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const { action, flagId, userId, reason } = body;
  const db = createSupabaseServiceRole();

  if (action === 'resolve' && flagId) {
    const { error } = await db
      .from('user_flags')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: auth.user.id })
      .eq('id', flagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'block' && userId && reason) {
    const { error } = await db
      .from('profiles')
      .update({ is_blocked: true, blocked_reason: reason, blocked_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Auto-resolve all unresolved flags for this user
    await db
      .from('user_flags')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: auth.user.id, resolution_note: `Konto zablokowane: ${reason}` })
      .eq('user_id', userId)
      .eq('resolved', false);

    return NextResponse.json({ ok: true });
  }

  if (action === 'unblock' && userId) {
    const { error } = await db
      .from('profiles')
      .update({ is_blocked: false, blocked_reason: null, blocked_at: null })
      .eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
