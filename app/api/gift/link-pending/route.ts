import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/gift/link-pending
// Called after login — links any pending gifts addressed to user's email.
// Also immediately transfers the entitlement if gift is still pending.
export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();

  // Get user's email from profile
  const { data: profile } = await db
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single();

  const email = profile?.email ?? user.email;
  if (!email) return NextResponse.json({ linked: 0 });

  // Find pending gifts for this email that aren't linked yet
  const { data: pendingGifts } = await db
    .from('session_gifts')
    .select('id, entitlement_id, purchased_by')
    .eq('recipient_email', email.toLowerCase())
    .eq('status', 'pending')
    .is('recipient_user_id', null)
    .neq('purchased_by', user.id);

  if (!pendingGifts || pendingGifts.length === 0) {
    return NextResponse.json({ linked: 0 });
  }

  let linked = 0;
  for (const gift of pendingGifts) {
    // Link recipient_user_id so they can see it in their panel
    await db
      .from('session_gifts')
      .update({ recipient_user_id: user.id })
      .eq('id', gift.id);
    linked++;
  }

  return NextResponse.json({ linked });
}
