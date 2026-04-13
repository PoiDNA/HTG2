import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Resend } from 'resend';

const FROM_EMAIL = 'HTG <sesje@htgcyou.com>';
const REPLY_TO = 'htg@htg.cyou';

/**
 * GET /api/cron/community-digest
 *
 * Weekly email digest — sends a summary of community activity
 * to users who have email_digest = 'weekly' (default).
 *
 * Scheduled via vercel.json: "0 9 * * 1" (Monday 9am)
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServiceRole();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const results = { users_processed: 0, emails_sent: 0, errors: 0 };

  // Get all users who want weekly digest
  // Use a LEFT JOIN approach: get all community members, check preferences
  const { data: members } = await db
    .from('community_memberships')
    .select('user_id')
    .limit(5000);

  const uniqueUserIds = [...new Set((members ?? []).map(m => m.user_id))];
  if (uniqueUserIds.length === 0) {
    return NextResponse.json(results);
  }

  // Get preferences (users without preferences default to 'weekly')
  const { data: prefs } = await db
    .from('community_user_preferences')
    .select('user_id, email_digest')
    .in('user_id', uniqueUserIds);

  const prefsMap = new Map((prefs ?? []).map(p => [p.user_id, p.email_digest]));

  // Filter users who explicitly opted in to weekly digest
  const digestUserIds = uniqueUserIds.filter(uid => {
    const pref = prefsMap.get(uid);
    return pref === 'weekly' || pref === 'daily';
  });

  if (digestUserIds.length === 0) {
    return NextResponse.json(results);
  }

  // Get activity from last 7 days per user's groups
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get recent posts count per group
  const { data: recentPosts } = await db
    .from('community_posts')
    .select('group_id')
    .gte('created_at', sevenDaysAgo)
    .is('deleted_at', null);

  // Get recent comments count per group
  const { data: recentComments } = await db
    .from('community_comments')
    .select('group_id')
    .gte('created_at', sevenDaysAgo)
    .is('deleted_at', null);

  // Count activity per group
  const groupPostCounts = new Map<string, number>();
  for (const p of recentPosts ?? []) {
    groupPostCounts.set(p.group_id, (groupPostCounts.get(p.group_id) || 0) + 1);
  }
  const groupCommentCounts = new Map<string, number>();
  for (const c of recentComments ?? []) {
    groupCommentCounts.set(c.group_id, (groupCommentCounts.get(c.group_id) || 0) + 1);
  }

  // Get group names
  const activeGroupIds = [...new Set([...groupPostCounts.keys(), ...groupCommentCounts.keys()])];
  const { data: groups } = activeGroupIds.length > 0
    ? await db.from('community_groups').select('id, name, slug').in('id', activeGroupIds)
    : { data: [] };
  const groupMap = new Map((groups ?? []).map(g => [g.id, g]));

  // Get user memberships
  const { data: allMemberships } = await db
    .from('community_memberships')
    .select('user_id, group_id')
    .in('user_id', digestUserIds);

  const userGroups = new Map<string, string[]>();
  for (const m of allMemberships ?? []) {
    const existing = userGroups.get(m.user_id) || [];
    existing.push(m.group_id);
    userGroups.set(m.user_id, existing);
  }

  // Get user profiles and emails
  const { data: profiles } = await db
    .from('profiles')
    .select('id, display_name, email')
    .in('id', digestUserIds);

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  // Send digest to each user
  for (const userId of digestUserIds) {
    results.users_processed++;
    const profile = profileMap.get(userId);
    if (!profile?.email) continue;

    const myGroupIds = userGroups.get(userId) || [];
    if (myGroupIds.length === 0) continue;

    // Build activity summary for user's groups
    const groupSummaries: Array<{ name: string; slug: string; posts: number; comments: number }> = [];
    let totalPosts = 0;
    let totalComments = 0;

    for (const gid of myGroupIds) {
      const posts = groupPostCounts.get(gid) || 0;
      const comments = groupCommentCounts.get(gid) || 0;
      if (posts === 0 && comments === 0) continue;

      const group = groupMap.get(gid);
      if (!group) continue;

      groupSummaries.push({ name: group.name, slug: group.slug, posts, comments });
      totalPosts += posts;
      totalComments += comments;
    }

    if (groupSummaries.length === 0) continue; // No activity in user's groups

    // Build email HTML
    const name = profile.display_name || 'Użytkowniku';
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://htg.cyou';

    const groupRows = groupSummaries
      .sort((a, b) => (b.posts + b.comments) - (a.posts + a.comments))
      .slice(0, 5) // Top 5 groups
      .map(g => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">
            <a href="${baseUrl}/pl/spolecznosc/${g.slug}" style="color: #5A8A4E; text-decoration: none; font-weight: 500;">
              ${g.name}
            </a>
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: center;">${g.posts}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: center;">${g.comments}</td>
        </tr>
      `).join('');

    const html = `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #3A2A30;">
        <div style="background: #3A2A30; padding: 24px; text-align: center;">
          <h1 style="color: #D4A840; margin: 0; font-size: 24px;">HTG Społeczność</h1>
          <p style="color: #C8949E; margin: 8px 0 0; font-size: 14px;">Tygodniowe podsumowanie</p>
        </div>
        <div style="padding: 24px; background: #FDF5F0;">
          <p>Cześć ${name},</p>
          <p>W ostatnim tygodniu w Twoich grupach pojawiło się <strong>${totalPosts} ${totalPosts === 1 ? 'nowy post' : 'nowych postów'}</strong> i <strong>${totalComments} ${totalComments === 1 ? 'komentarz' : 'komentarzy'}</strong>.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <thead>
              <tr style="background: #F5EDE8;">
                <th style="padding: 8px 12px; text-align: left; font-size: 13px;">Grupa</th>
                <th style="padding: 8px 12px; text-align: center; font-size: 13px;">Posty</th>
                <th style="padding: 8px 12px; text-align: center; font-size: 13px;">Komentarze</th>
              </tr>
            </thead>
            <tbody>
              ${groupRows}
            </tbody>
          </table>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${baseUrl}/pl/spolecznosc" style="display: inline-block; padding: 12px 24px; background: #5A8A4E; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">
              Przejdź do społeczności
            </a>
          </div>

          <p style="font-size: 12px; color: #999; margin-top: 24px;">
            Możesz wyłączyć digest w ustawieniach społeczności.
          </p>
        </div>
      </div>
    `;

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: profile.email,
        replyTo: REPLY_TO,
        subject: `HTG Społeczność — ${totalPosts} nowych postów w tym tygodniu`,
        html,
      });

      // Log digest
      await db.from('community_digest_log').insert({
        user_id: userId,
        digest_type: 'weekly',
        post_count: totalPosts,
        comment_count: totalComments,
      });

      results.emails_sent++;
    } catch (err) {
      console.error(`Digest email failed for ${userId}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json(results);
}
