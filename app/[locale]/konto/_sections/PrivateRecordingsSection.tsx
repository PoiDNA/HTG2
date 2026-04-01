import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import { Headphones } from 'lucide-react';
import { Link } from '@/i18n-config';
import { getFormatter } from 'next-intl/server';
import DashboardRecordingList, { DashboardRecordingItem } from './DashboardRecordingList';

/**
 * Private session recordings section for /konto dashboard.
 * Shows last 5 recordings + "Show all" link.
 * Wrapped in <Suspense> by parent — streams independently.
 */
export default async function PrivateRecordingsSection({ locale }: { locale: string }) {
  const { userId } = await getEffectiveUser();
  const db = createSupabaseServiceRole();

  const [{ data: authUser }, { data: recordings }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db
      .from('booking_recording_access')
      .select(`
        granted_at,
        recording:booking_recordings(
          id, title, session_type, session_date, status, duration_seconds,
          expires_at, legal_hold, booking_id, recording_started_at
        )
      `)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('granted_at', { ascending: false })
      .limit(6)
  ]);

  const userEmail = authUser?.user?.email ?? '';

  const items = (recordings ?? [])
    .map((r) => {
      const rec = r.recording;
      return (Array.isArray(rec) ? rec[0] : rec) as Record<string, unknown> | null;
    })
    .filter(Boolean)
    .filter((r) => ['queued', 'preparing', 'uploading', 'processing', 'ready'].includes(r!.status as string)) as Record<string, unknown>[];

  const hasMore = items.length > 5;
  const displayItems = items.slice(0, 5);

  const format = await getFormatter({ locale });

  const formattedItems: DashboardRecordingItem[] = displayItems.map((item) => {
    const sessionType = item.session_type as SessionType;
    const config = SESSION_CONFIG[sessionType];
    const isPara = sessionType === 'natalia_para';
    const isReady = item.status === 'ready';
    const isLegalHold = item.legal_hold === true;

    // Build a readable title: prefer config label, fallback to cleaned-up DB title
    const rawTitle = item.title as string | null;
    const displayTitle = config?.label
      ?? (rawTitle && !rawTitle.startsWith('Import') ? rawTitle : null)
      ?? 'Sesja indywidualna';

    // Extract email from raw title (format: "Import — 2025-12-01 — email@example.com")
    const emailMatch = rawTitle?.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const recordingEmail = emailMatch?.[0] ?? null;

    return {
      id: item.id as string,
      title: displayTitle,
      configColor: config?.color ?? 'bg-gray-500',
      configLabel: config?.labelShort ?? 'Sesja',
      isPara,
      isReady,
      isLegalHold,
      dateLabel: item.session_date ? format.dateTime(new Date(item.session_date as string), { dateStyle: 'medium' }) : '',
      durationLabel: item.duration_seconds ? `${Math.floor((item.duration_seconds as number) / 60)} min` : null,
      showRevoke: isReady && !isLegalHold,
      recordingEmail,
    };
  });

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Headphones className="w-5 h-5 text-htg-sage" />
          <h2 className="text-lg font-serif font-semibold text-htg-fg">Nagrania z Twoich sesji</h2>
        </div>
        {items.length > 0 && (
          <Link
            href="/konto/nagrania-sesji"
            className="text-sm text-htg-sage hover:underline"
          >
            Pokaż wszystkie &rarr;
          </Link>
        )}
      </div>

      {displayItems.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
          <Headphones className="w-10 h-10 text-htg-fg-muted/30 mx-auto mb-3" />
          <p className="text-sm text-htg-fg-muted">
            Nagrania z Twoich sesji pojawią się tutaj po pierwszej sesji z nagraniem.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <DashboardRecordingList items={formattedItems} userEmail={userEmail} userId={userId} />

          {hasMore && (
            <Link
              href="/konto/nagrania-sesji"
              className="block text-center text-sm text-htg-sage hover:underline py-2"
            >
              Pokaż wszystkie nagrania &rarr;
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
