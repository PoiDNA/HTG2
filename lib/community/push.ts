import webpush from 'web-push';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// Configure VAPID keys — generate once with: npx web-push generate-vapid-keys
// Store in env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = 'mailto:htg@htg.cyou';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Send a push notification to a specific user.
 * Sends to all their registered subscriptions.
 * Removes stale subscriptions on failure (410 Gone).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const db = createSupabaseServiceRole();

  // Check user preferences
  const { data: prefs } = await db
    .from('community_user_preferences')
    .select('push_enabled')
    .eq('user_id', userId)
    .single();

  if (prefs && !prefs.push_enabled) return;

  // Get all push subscriptions for this user
  const { data: subscriptions } = await db
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .eq('user_id', userId);

  if (!subscriptions?.length) return;

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/spolecznosc',
    icon: payload.icon || '/favicon.ico',
  });

  const staleIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys as { p256dh: string; auth: string },
          },
          pushPayload
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 410 Gone or 404 = subscription expired
        if (statusCode === 410 || statusCode === 404) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    await db.from('push_subscriptions').delete().in('id', staleIds);
  }
}

/**
 * Send push notifications to multiple users.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  await Promise.allSettled(
    userIds.map(userId => sendPushToUser(userId, payload))
  );
}
