import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { PRODUCT_SLUGS } from '@/lib/booking/constants';

export async function GET(req: NextRequest) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const { supabase } = check;

  // ── profiles ──────────────────────────────────────────────────────────────
  let profilesQuery = supabase
    .from('profiles')
    .select('id, email, display_name, wix_member_id, created_at', { count: 'exact' })
    .order('email', { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (q) {
    profilesQuery = profilesQuery.or(`email.ilike.%${q}%,display_name.ilike.%${q}%`);
  }

  const { data: profiles, count } = await profilesQuery;
  if (!profiles?.length) {
    return NextResponse.json({ profiles: [], entitlements: [], count: 0 });
  }

  // ── entitlements for these users ──────────────────────────────────────────
  const userIds = profiles.map((p) => p.id);
  const { data: entitlements } = await supabase
    .from('entitlements')
    .select('id, user_id, type, scope_month, valid_from, valid_until, is_active, source, created_at')
    .in('user_id', userIds)
    .order('scope_month', { ascending: false });

  return NextResponse.json({ profiles, entitlements: entitlements ?? [], count });
}

export async function POST(req: NextRequest) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  const body = await req.json() as { userId?: string; type?: string; startMonth?: string };
  const { userId, type, startMonth } = body;

  if (!userId || !type || !startMonth) {
    return NextResponse.json({ error: 'Brakujące pola: userId, type, startMonth' }, { status: 400 });
  }
  if (!['monthly', 'yearly'].includes(type)) {
    return NextResponse.json({ error: 'Nieprawidłowy typ subskrypcji' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(startMonth)) {
    return NextResponse.json({ error: 'startMonth musi być w formacie YYYY-MM' }, { status: 400 });
  }

  const { supabase } = check;

  const slug = type === 'monthly' ? PRODUCT_SLUGS.MONTHLY : PRODUCT_SLUGS.YEARLY;
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!product) {
    return NextResponse.json({ error: `Produkt "${slug}" nie istnieje w bazie` }, { status: 404 });
  }

  const VALID_UNTIL = '2099-12-31'; // bezterminowe

  if (type === 'monthly') {
    const { error } = await supabase.from('entitlements').insert({
      user_id: userId,
      product_id: product.id,
      type: 'monthly',
      scope_month: startMonth,
      valid_from: `${startMonth}-01`,
      valid_until: VALID_UNTIL,
      is_active: true,
      source: 'manual',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, inserted: 1 });
  }

  // Yearly — 12 consecutive months
  const rows = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(`${startMonth}-01T00:00:00`);
    d.setMonth(d.getMonth() + i);
    const scopeMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      user_id: userId,
      product_id: product.id,
      type: 'yearly',
      scope_month: scopeMonth,
      valid_from: `${scopeMonth}-01`,
      valid_until: VALID_UNTIL,
      is_active: true,
      source: 'manual',
    };
  });

  const { error } = await supabase.from('entitlements').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, inserted: 12 });
}

export async function DELETE(req: NextRequest) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  const { searchParams } = new URL(req.url);
  const entitlementId = searchParams.get('id');
  if (!entitlementId) {
    return NextResponse.json({ error: 'Brakujące id' }, { status: 400 });
  }

  const { error } = await check.supabase
    .from('entitlements')
    .update({ is_active: false })
    .eq('id', entitlementId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
