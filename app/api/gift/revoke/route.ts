import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/gift/revoke
// Iwona cancels the gift — entitlement stays on her account, gift is revoked
// Body: { giftId }
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { giftId } = await req.json();
  if (!giftId) return NextResponse.json({ error: 'giftId required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  const { data: gift } = await db
    .from('session_gifts')
    .select('id, status, entitlement_id')
    .eq('id', giftId)
    .eq('purchased_by', user.id)
    .single();

  if (!gift) return NextResponse.json({ error: 'Gift not found' }, { status: 404 });
  if (gift.status === 'claimed') return NextResponse.json({ error: 'Sesja już została odebrana — nie można odwołać' }, { status: 409 });

  // Entitlement stays on purchaser's account (user_id unchanged)
  await db
    .from('session_gifts')
    .update({ status: 'revoked' })
    .eq('id', gift.id);

  return NextResponse.json({ revoked: true });
}
