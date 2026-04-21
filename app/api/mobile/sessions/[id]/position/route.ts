import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { requireBearer, jsonError } from '../../../_lib/auth';

export const dynamic = 'force-dynamic';

const MAX_POSITION_SEC = 60 * 60 * 24;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireBearer(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const positionSec =
    typeof body === 'object' &&
    body !== null &&
    'positionSec' in body &&
    typeof (body as { positionSec: unknown }).positionSec === 'number'
      ? (body as { positionSec: number }).positionSec
      : null;

  if (
    positionSec === null ||
    !Number.isFinite(positionSec) ||
    positionSec < 0 ||
    positionSec > MAX_POSITION_SEC
  ) {
    return jsonError('Invalid positionSec', 400);
  }

  const admin = createSupabaseServiceRole();
  const { error } = await admin.from('session_progress').upsert(
    {
      user_id: auth.user.id,
      session_id: id,
      position_sec: positionSec,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true });
}
