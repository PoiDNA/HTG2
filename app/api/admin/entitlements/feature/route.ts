import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

/**
 * POST /api/admin/entitlements/feature
 * Grant a feature entitlement to a user.
 *
 * Body: { userId: string, featureKey: string, validUntil: string (ISO date) }
 *
 * DELETE /api/admin/entitlements/feature?id=<entitlementId>
 * Revoke (deactivate) a feature entitlement.
 */

export async function POST(req: NextRequest) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { userId, featureKey, validUntil } = body as {
    userId?: string;
    featureKey?: string;
    validUntil?: string;
  };

  if (!userId || !featureKey || !validUntil) {
    return NextResponse.json(
      { error: 'Brakujące pola: userId, featureKey, validUntil' },
      { status: 400 },
    );
  }

  if (!['fragments'].includes(featureKey)) {
    return NextResponse.json({ error: `Nieznany feature: ${featureKey}` }, { status: 400 });
  }

  const validUntilDate = new Date(validUntil);
  if (isNaN(validUntilDate.getTime()) || validUntilDate <= new Date()) {
    return NextResponse.json({ error: 'validUntil musi być przyszłą datą' }, { status: 400 });
  }

  const { supabase } = check;

  // Deactivate any existing active feature entitlement for this user+key
  // (upsert-like: revoke old, insert new — keeps full audit trail)
  await supabase
    .from('entitlements')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('type', 'feature')
    .eq('feature_key', featureKey)
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('entitlements')
    .insert({
      user_id: userId,
      type: 'feature',
      feature_key: featureKey,
      valid_from: new Date().toISOString().slice(0, 10),
      valid_until: validUntilDate.toISOString(),
      is_active: true,
      source: 'manual',
    })
    .select('id, feature_key, valid_until, is_active, created_at')
    .single();

  if (error) {
    if (error.code === '42703') {
      return NextResponse.json(
        { error: 'Kolumna feature_key nie istnieje — uruchom migrację 091 na produkcji' },
        { status: 503 },
      );
    }
    console.error('[admin/entitlements/feature] POST failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entitlement: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Brakujące id' }, { status: 400 });

  const { error } = await check.supabase
    .from('entitlements')
    .update({ is_active: false })
    .eq('id', id)
    .eq('type', 'feature'); // safety: only revoke feature entitlements via this endpoint

  if (error) {
    console.error('[admin/entitlements/feature] DELETE failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
