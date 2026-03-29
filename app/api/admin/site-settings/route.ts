import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const db = createSupabaseServiceRole();
  const { data, error } = await db.from('site_settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings = Object.fromEntries((data ?? []).map(({ key, value }) => [key, value]));
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const db = createSupabaseServiceRole();

  const updates = Object.entries(body as Record<string, unknown>).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  }));

  const { error } = await db
    .from('site_settings')
    .upsert(updates, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
