import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/gift/transfer
// Iwona manually transfers her entitlement to another user by email
// Body: { giftId, recipientEmail }
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { giftId, recipientEmail } = await req.json();
  if (!giftId || !recipientEmail) {
    return NextResponse.json({ error: 'giftId and recipientEmail required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Verify purchaser owns this gift
  const { data: gift } = await db
    .from('session_gifts')
    .select('id, entitlement_id, status')
    .eq('id', giftId)
    .eq('purchased_by', user.id)
    .single();

  if (!gift) return NextResponse.json({ error: 'Gift not found' }, { status: 404 });
  if (gift.status === 'claimed') return NextResponse.json({ error: 'Sesja już została odebrana' }, { status: 409 });
  if (gift.status === 'revoked') return NextResponse.json({ error: 'Prezent jest odwołany' }, { status: 409 });

  // Find recipient by email
  const { data: recipientProfile } = await db
    .from('profiles')
    .select('id, display_name, email')
    .eq('email', recipientEmail.toLowerCase())
    .maybeSingle();

  if (!recipientProfile) {
    return NextResponse.json({ error: 'Nie znaleziono konta dla tego adresu email. Odbiorca musi najpierw założyć konto.' }, { status: 404 });
  }

  // Transfer entitlement
  await db
    .from('entitlements')
    .update({ user_id: recipientProfile.id })
    .eq('id', gift.entitlement_id);

  await db
    .from('session_gifts')
    .update({
      status: 'claimed',
      recipient_user_id: recipientProfile.id,
      recipient_email: recipientEmail.toLowerCase(),
      claimed_at: new Date().toISOString(),
    })
    .eq('id', gift.id);

  return NextResponse.json({
    transferred: true,
    recipientName: recipientProfile.display_name ?? recipientProfile.email,
  });
}
