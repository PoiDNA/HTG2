import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/gift/claim
// Body: { token } — logged-in user claims a gift, moving entitlement to their account
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  const { data: gift } = await db
    .from('session_gifts')
    .select('id, entitlement_id, status, purchased_by, recipient_email')
    .eq('claim_token', token)
    .single();

  if (!gift) return NextResponse.json({ error: 'Nieprawidłowy lub wygasły link prezentu' }, { status: 404 });
  if (gift.status === 'revoked') return NextResponse.json({ error: 'Prezent został odwołany' }, { status: 410 });
  if (gift.status === 'claimed') return NextResponse.json({ alreadyClaimed: true });

  // Prevent purchaser from claiming their own gift
  if (gift.purchased_by === user.id) {
    return NextResponse.json({ error: 'Nie możesz odebrać własnego prezentu' }, { status: 400 });
  }

  // Transfer entitlement to claimer
  await db
    .from('entitlements')
    .update({ user_id: user.id })
    .eq('id', gift.entitlement_id);

  // Mark gift as claimed
  await db
    .from('session_gifts')
    .update({
      status: 'claimed',
      recipient_user_id: user.id,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', gift.id);

  return NextResponse.json({ claimed: true });
}
