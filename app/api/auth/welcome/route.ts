import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { sendWelcomeEmail } from '@/lib/email/resend';

// POST /api/auth/welcome — send welcome email for new users (called once after first login)
// Also auto-joins user to community groups with auto_join=true
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await req.json();

  // Send welcome email
  let emailSent = false;
  try {
    const email = user.email;
    if (email) {
      await sendWelcomeEmail(email, { name: name || email.split('@')[0] });
      emailSent = true;
    }
  } catch (err) {
    console.error('Welcome email failed:', err);
  }

  // Auto-join community groups (onboarding)
  let communityJoined = 0;
  try {
    const db = createSupabaseServiceRole();
    const { data: autoJoinGroups } = await db
      .from('community_groups')
      .select('id')
      .eq('auto_join', true)
      .eq('is_archived', false);

    if (autoJoinGroups?.length) {
      const { data: existing } = await db
        .from('community_memberships')
        .select('group_id')
        .eq('user_id', user.id)
        .in('group_id', autoJoinGroups.map(g => g.id));

      const existingIds = new Set((existing ?? []).map(e => e.group_id));
      const toJoin = autoJoinGroups.filter(g => !existingIds.has(g.id));

      if (toJoin.length > 0) {
        await db.from('community_memberships').insert(
          toJoin.map(g => ({ group_id: g.id, user_id: user.id, role: 'member' }))
        );
        communityJoined = toJoin.length;
      }
    }
  } catch (err) {
    console.error('Community onboarding failed:', err);
  }

  return NextResponse.json({ sent: emailSent, community_joined: communityJoined });
}
