import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getRoleForEmail } from '@/lib/roles';
import { sendWelcomeEmail, sendInvitationAccepted } from '@/lib/email/resend';
import { locales } from '@/i18n-config';

/**
 * POST /api/auth/post-login
 * Centralized post-login hook called after any auth method (OTP, magic link, SSO, passkey).
 * Handles: GDPR consent, role sync, new-user detection, welcome email, gift linking, community join.
 *
 * Body: { consent?: boolean, consentText?: string, locale?: string }
 * Returns: { isNew: boolean, role: string | null }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { consent, consentText, locale: requestLocale } = await req.json().catch(() => ({} as Record<string, unknown>));

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

  // 2b. Save preferred locale (only if valid and profile doesn't already have one set by the user)
  try {
    if (typeof requestLocale === 'string' && (locales as readonly string[]).includes(requestLocale)) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('preferred_locale')
        .eq('id', user.id)
        .single();

      // Only set if not already customized (still default 'pl' or null)
      if (!profile?.preferred_locale || profile.preferred_locale === 'pl') {
        await supabase.from('profiles').update({ preferred_locale: requestLocale }).eq('id', user.id);
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

  // 6. Convert external invitations for this email (idempotent — runs every login)
  try {
    const userEmail = user.email?.toLowerCase();
    if (userEmail) {
      const db = createSupabaseServiceRole();

      // Lazy-expire old invitations
      await db
        .from('external_invitations')
        .update({ status: 'expired' })
        .eq('email', userEmail)
        .eq('status', 'sent')
        .lt('expires_at', new Date().toISOString());

      // Convert active invitations
      const { data: pending } = await db
        .from('external_invitations')
        .select('id, inviter_id')
        .eq('email', userEmail)
        .eq('status', 'sent')
        .gt('expires_at', new Date().toISOString());

      if (pending?.length) {
        await db
          .from('external_invitations')
          .update({
            status: 'registered',
            registered_user_id: user.id,
            registered_at: new Date().toISOString(),
          })
          .in('id', pending.map(i => i.id));

        // Notify each inviter (fire-and-forget)
        const newUserName = user.user_metadata?.display_name
          || user.user_metadata?.full_name
          || userEmail.split('@')[0];

        for (const inv of pending) {
          const { data: inviterProfile } = await db
            .from('profiles')
            .select('email, display_name')
            .eq('id', inv.inviter_id)
            .single();

          if (inviterProfile?.email) {
            void sendInvitationAccepted(inviterProfile.email, {
              inviterName: inviterProfile.display_name || inviterProfile.email.split('@')[0],
              newUserName,
              newUserEmail: userEmail,
            }).catch(() => {});
          }
        }
      }
    }
  } catch { /* Non-blocking */ }

  return NextResponse.json({ isNew, role });
}
