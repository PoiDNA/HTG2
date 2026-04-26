import { NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { requireSesjeEditor } from '../_auth';

export async function GET() {
  const auth = await requireSesjeEditor();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!auth.isAdmin) return NextResponse.json({ error: 'admin_only' }, { status: 403 });

  const db = createSupabaseServiceRole();
  const { data: rows } = await db
    .from('admin_audit_log')
    .select('id, admin_id, action, details, created_at')
    .like('action', 'sesje_%')
    .order('created_at', { ascending: false })
    .limit(200);

  const adminIds = Array.from(new Set((rows ?? []).map(r => r.admin_id)));
  const emailMap = new Map<string, string>();
  if (adminIds.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, email')
      .in('id', adminIds);
    for (const p of profiles ?? []) {
      if (p.email) emailMap.set(p.id, p.email);
    }
  }

  const entries = (rows ?? []).map(r => ({
    ...r,
    admin_email: emailMap.get(r.admin_id) ?? (r.details as { actor_email?: string })?.actor_email ?? null,
  }));

  return NextResponse.json({ entries });
}
