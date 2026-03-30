import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getRoleForEmail } from '@/lib/roles';
import { sendWelcomeEmail } from '@/lib/email/resend';

/**
 * POST /api/auth/post-login
 * Centralized post-login hook called after any auth method (OTP, magic link, SSO, passkey).
 * Handles: GDPR consent, role sync, new-user detection, welcome email, gift linking, community join.
 *
 * Body: { consent?: boolean, consentText?: string }
 * Returns: { isNew: boolean, role: string | null }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { consent, consentText } = await req.json().catch(() => ({}));

  // 1. Record GDPR consent
  if (consent) {
    try {
      await supabase.from('consent_records').insert({
        consent_type: 'sensitive_data',
        granted: true,
        consent_text: consentText || 'GDPR Art. 9 consent',
      });
    } catch { /* Non-blocking */ }
  }

  // 2. Auto-set role based on email
  let role: string | null = null;
  try {
    if (user.email) {
      const expectedRole = getRoleForEmail(user.email);
      if (expectedRole) {
        await supabase.from('profiles').update({ role: expectedRole }).eq('id', user.id);
        role = expectedRole;
      }
    }
  } catch { /* Non-blocking */ }

  // 3. Check if new user — account created within the last 2 minutes
  let isNew = false;
  try {
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    const ageMs = Date.now() - createdAt;
    isNew = ageMs < 2 * 60 * 1000; // less than 2 minutes old
  } catch { /* Non-blocking */ }

  // 4. Link pending gifts
  try {
    await fetch(new URL('/api/gift/link-pending', req.url), { method: 'POST', headers: req.headers });
  } catch { /* Non-blocking */ }

  // 5. Welcome email + community join for new users
  if (isNew) {
    try {
      const db = createSupabaseServiceRole();
      const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '';

      // Welcome email
      if (user.email) {
        await sendWelcomeEmail(user.email, { name }).catch(() => {});
      }

      // Auto-join community groups
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
        }
      }
    } catch { /* Non-blocking */ }
  }

  return NextResponse.json({ isNew, role });
}
