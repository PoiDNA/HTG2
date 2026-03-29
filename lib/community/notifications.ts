import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { sendPushToUser } from './push';
import type { NotificationType } from './types';

interface CreateNotificationParams {
  userId: string;
  actorId: string;
  type: NotificationType;
  targetType: 'post' | 'comment';
  targetId: string;
  groupId: string;
}

/**
 * Create a notification for a user.
 * Skips self-notifications. Uses ON CONFLICT DO NOTHING for idempotency.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const { userId, actorId, type, targetType, targetId, groupId } = params;

  // Don't notify yourself
  if (userId === actorId) return;

  const db = createSupabaseServiceRole();

  await db
    .from('community_notifications')
    .insert({
      user_id: userId,
      actor_id: actorId,
      type,
      target_type: targetType,
      target_id: targetId,
      group_id: groupId,
    });

  // Send push notification (async, don't block)
  const pushMessages: Record<NotificationType, string> = {
    comment: 'skomentował(a) Twój post',
    reaction: 'polubił(a) Twój post',
    mention: 'wspomniał(a) o Tobie',
    new_post: 'dodał(a) nowy post',
    group_invite: 'zaprosił(a) Cię do grupy',
  };

  // Get actor name for push
  const { data: actor } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', actorId)
    .single();

  const actorName = actor?.display_name || 'Ktoś';

  sendPushToUser(userId, {
    title: 'HTG Społeczność',
    body: `${actorName} ${pushMessages[type]}`,
    url: `/spolecznosc`,
  }).catch(() => {}); // Fire and forget
}

/**
 * Create notifications for multiple mentioned users.
 * Supports @user, @all (all group members), @staff (staff members in group).
 */
export async function createMentionNotifications(params: {
  mentionedUserIds: string[];
  mentionTypes?: Array<'user' | 'all' | 'staff'>;
  actorId: string;
  targetType: 'post' | 'comment';
  targetId: string;
  groupId: string;
}): Promise<void> {
  const { mentionedUserIds, mentionTypes = [], actorId, targetType, targetId, groupId } = params;
  const db = createSupabaseServiceRole();

  let allRecipientIds = [...new Set(mentionedUserIds)].filter(id => id !== actorId);

  // Handle @all — notify all group members
  if (mentionTypes.includes('all')) {
    const { data: members } = await db
      .from('community_memberships')
      .select('user_id')
      .eq('group_id', groupId)
      .neq('user_id', actorId);

    const memberIds = (members ?? []).map(m => m.user_id);
    allRecipientIds = [...new Set([...allRecipientIds, ...memberIds])];
  }

  // Handle @staff — notify staff/moderator members in group
  if (mentionTypes.includes('staff')) {
    const { data: staffMembers } = await db
      .from('community_memberships')
      .select('user_id')
      .eq('group_id', groupId)
      .in('role', ['moderator', 'admin'])
      .neq('user_id', actorId);

    // Also add platform-level staff
    const { data: platformStaff } = await db
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'moderator'])
      .neq('id', actorId);

    const staffIds = [
      ...(staffMembers ?? []).map(m => m.user_id),
      ...(platformStaff ?? []).map(p => p.id),
    ];
    allRecipientIds = [...new Set([...allRecipientIds, ...staffIds])];
  }

  if (allRecipientIds.length === 0) return;

  // Cap at 500 to prevent accidental mass notifications
  const capped = allRecipientIds.slice(0, 500);

  // Batch insert notifications
  const notifications = capped.map(userId => ({
    user_id: userId,
    actor_id: actorId,
    type: 'mention' as const,
    target_type: targetType,
    target_id: targetId,
    group_id: groupId,
  }));

  // Insert in batches of 100
  for (let i = 0; i < notifications.length; i += 100) {
    const batch = notifications.slice(i, i + 100);
    await db.from('community_notifications').insert(batch);
  }
}

/**
 * Aggregate similar notifications for the same target.
 * Updates an existing notification with new actor_ids instead of creating duplicates.
 * E.g., "Anna, Bob, and 3 others commented on your post"
 */
export async function createAggregatedNotification(params: CreateNotificationParams): Promise<void> {
  const { userId, actorId, type, targetType, targetId, groupId } = params;

  if (userId === actorId) return;

  const db = createSupabaseServiceRole();
  const groupedKey = `${targetId}:${type}`;

  // Try to find existing unread notification with same grouped_key
  const { data: existing } = await db
    .from('community_notifications')
    .select('id, actor_ids')
    .eq('user_id', userId)
    .eq('grouped_key', groupedKey)
    .eq('is_read', false)
    .single();

  if (existing) {
    // Aggregate: add new actor to existing notification
    const currentActors = (existing.actor_ids ?? []) as string[];
    if (currentActors.includes(actorId)) return; // Already aggregated

    await db
      .from('community_notifications')
      .update({
        actor_id: actorId, // Most recent actor
        actor_ids: [...currentActors, actorId],
        created_at: new Date().toISOString(), // Bump to top
      })
      .eq('id', existing.id);
  } else {
    // Create new notification with grouped_key
    await db
      .from('community_notifications')
      .insert({
        user_id: userId,
        actor_id: actorId,
        type,
        target_type: targetType,
        target_id: targetId,
        group_id: groupId,
        grouped_key: groupedKey,
        actor_ids: [actorId],
      });
  }

  // Push notification (fire and forget)
  const { data: actor } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', actorId)
    .single();

  const pushMessages: Record<NotificationType, string> = {
    comment: 'skomentował(a) Twój post',
    reaction: 'polubił(a) Twój post',
    mention: 'wspomniał(a) o Tobie',
    new_post: 'dodał(a) nowy post',
    group_invite: 'zaprosił(a) Cię do grupy',
  };

  const actorName = actor?.display_name || 'Ktoś';
  sendPushToUser(userId, {
    title: 'HTG Społeczność',
    body: `${actorName} ${pushMessages[type]}`,
    url: `/spolecznosc`,
  }).catch(() => {});
}

/**
 * Notify the post author about a new comment.
 */
export async function notifyPostAuthor(params: {
  postAuthorId: string;
  commenterId: string;
  postId: string;
  groupId: string;
}): Promise<void> {
  await createNotification({
    userId: params.postAuthorId,
    actorId: params.commenterId,
    type: 'comment',
    targetType: 'post',
    targetId: params.postId,
    groupId: params.groupId,
  });
}

/**
 * Notify about a reaction on a post or comment.
 */
export async function notifyReaction(params: {
  targetOwnerId: string;
  reactorId: string;
  targetType: 'post' | 'comment';
  targetId: string;
  groupId: string;
}): Promise<void> {
  await createNotification({
    userId: params.targetOwnerId,
    actorId: params.reactorId,
    type: 'reaction',
    targetType: params.targetType,
    targetId: params.targetId,
    groupId: params.groupId,
  });
}
