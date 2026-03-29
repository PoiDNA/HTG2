import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * GET /api/community/preferences
 *
 * Get user's community notification preferences.
 */
export async function GET() {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  const { data: prefs } = await supabase
    .from('community_user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Return defaults if no preferences set
  if (!prefs) {
    return NextResponse.json({
      email_digest: 'weekly',
      push_enabled: true,
      push_comments: true,
      push_mentions: true,
      push_reactions: false,
    });
  }

  return NextResponse.json(prefs);
}

/**
 * PATCH /api/community/preferences
 *
 * Update notification preferences.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const { email_digest, push_enabled, push_comments, push_mentions, push_reactions } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (email_digest !== undefined) updates.email_digest = email_digest;
  if (push_enabled !== undefined) updates.push_enabled = push_enabled;
  if (push_comments !== undefined) updates.push_comments = push_comments;
  if (push_mentions !== undefined) updates.push_mentions = push_mentions;
  if (push_reactions !== undefined) updates.push_reactions = push_reactions;

  const { data: prefs, error } = await auth.supabase
    .from('community_user_preferences')
    .upsert({
      user_id: auth.user.id,
      ...updates,
    }, {
      onConflict: 'user_id',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }

  return NextResponse.json(prefs);
}
