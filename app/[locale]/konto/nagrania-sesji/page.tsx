import { setRequestLocale, getFormatter } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import { Headphones, Info } from 'lucide-react';
import FullRecordingList, { RecordingGroup } from './FullRecordingList';
import DashboardRecordingList, { DashboardRecordingItem } from '../_sections/DashboardRecordingList';
import PortalMessages from '@/components/account/PortalMessages';
import { headers } from 'next/headers';
import { isNagraniaPortal } from '@/lib/portal';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SessionRecordingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId } = await getEffectiveUser();
  const db = createSupabaseServiceRole();
  const headersList = await headers();
  const isPortal = isNagraniaPortal(headersList.get('host'));

  // Fetch user email for watermark
  const [{ data: authUser }, { data: recordings }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from('booking_recording_access')
      .select(`
        granted_at,
        revoked_at,
        recording:booking_recordings(
          id, title, session_type, session_date, status, duration_seconds,
          expires_at, legal_hold, booking_id, recording_started_at, metadata
        )
      `)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('granted_at', { ascending: false })
  ]);

  const userEmail = authUser?.user?.email ?? '';

  // Flatten and filter
  const items = (recordings ?? [])
    .map((r) => (Array.isArray(r.recording) ? r.recording[0] : r.recording) as Record<string, any>)
    .filter(Boolean)
    .filter((r) => ['queued', 'preparing', 'uploading', 'processing', 'ready'].includes(r.status as string));

  const format = await getFormatter({ locale });

  // ── PORTAL: flat DashboardRecordingList (same style as /konto dashboard) ──
  if (isPortal) {
    const portalItems: DashboardRecordingItem[] = items.map((item) => {
      const sessionType = item.session_type as SessionType;
      const config = SESSION_CONFIG[sessionType];
      const isPara = sessionType === 'natalia_para';
      const isReady = item.status === 'ready';
      const isLegalHold = item.legal_hold === true;

      const rawTitle = item.title as string | null;
      const displayTitle = config?.label
        ?? (rawTitle && !rawTitle.startsWith('Import') ? rawTitle : null)
        ?? 'Sesja indywidualna';

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
        showRevoke: false,
        recordingEmail,
      };
    });

    return (
      <div>
        {portalItems.length === 0 ? (
          <div className="text-center py-16">
            <Headphones className="w-12 h-12 text-htg-fg-muted/30 mx-auto mb-4" />
            <p className="text-htg-fg-muted">Nie masz jeszcze żadnych nagrań z sesji.</p>
          </div>
        ) : (
          <DashboardRecordingList items={portalItems} userEmail={userEmail} userId={userId} />
        )}

        {/* Centrum Kontaktu HTG */}
        <div className="mt-12">
          <h2 className="font-serif text-xl font-bold text-htg-fg mb-2">Centrum Kontaktu HTG</h2>
          <p className="text-sm text-htg-fg-muted mb-6 leading-relaxed">
            Jak coś nie działa albo potrzebujesz dostępu do innych nagrań — napisz przez Centrum Kontaktu HTG.<br />
            Po prostu daj znać 🙂
          </p>
          <p className="text-sm text-htg-fg-muted mb-6 leading-relaxed">
            Po zalogowaniu zawsze możesz wrócić do rozmów i sprawdzić, co było ustalone.<br />
            Odpowiemy jak najszybciej się da.
          </p>
          <PortalMessages />
        </div>
      </div>
    );
  }

  // ── MAIN SITE: grouped FullRecordingList ──

  // Group by booking_id
  const grouped = new Map<string, Record<string, any>[]>();
  for (const item of items) {
    const key = (item.booking_id as string) ?? item.id as string;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  // Sort groups by session_date desc
  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const dateA = a[1][0]?.session_date as string ?? '';
    const dateB = b[1][0]?.session_date as string ?? '';
    return dateB.localeCompare(dateA);
  });

  const formattedGroups: RecordingGroup[] = sortedGroups.map(([bookingId, recs]) => {
    const main = recs.reduce((longest, r) =>
      ((r.duration_seconds as number) ?? 0) > ((longest.duration_seconds as number) ?? 0) ? r : longest
    , recs[0]);

    const sessionType = main.session_type as SessionType;
    const config = SESSION_CONFIG[sessionType];
    const isPara = sessionType === 'natalia_para';
    const isReady = main.status === 'ready';
    const isLegalHold = main.legal_hold === true;
    const expiresAt = main.expires_at as string | null;

    const recordingStartedLabel = main.recording_started_at && main.session_date && isReady
      ? `Nagranie od ${format.dateTime(new Date(main.recording_started_at as string), { hour: '2-digit', minute: '2-digit' })}`
      : null;

    const legalHoldMessage = isLegalHold && isReady
      ? `To nagranie zostało zarchiwizowane. <a href="mailto:htg@htg.cyou" class="text-htg-sage hover:underline">Skontaktuj się z nami</a>, jeśli masz pytania.`
      : null;

    const rawTitle = main.title as string | null;
    const displayTitle = config?.label
      ?? (rawTitle && !rawTitle.startsWith('Import') ? rawTitle : null)
      ?? 'Sesja indywidualna';

    const emailMatch = rawTitle?.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const recordingEmail = emailMatch?.[0] ?? null;

    return {
      bookingId,
      mainId: main.id as string,
      title: displayTitle,
      configColor: config?.color ?? 'bg-gray-500',
      configLabel: config?.labelShort ?? 'Sesja',
      isPara,
      isReady,
      isLegalHold,
      dateLabel: main.session_date ? format.dateTime(new Date(main.session_date as string), { dateStyle: 'medium' }) : '',
      durationLabel: main.duration_seconds ? `${Math.floor((main.duration_seconds as number) / 60)} min` : null,
      expiresLabel: expiresAt && isReady && !isLegalHold ? `Dostępne do ${format.dateTime(new Date(expiresAt), { dateStyle: 'medium' })}` : null,
      recordingStartedLabel,
      legalHoldMessage,
      recordingEmail,
      parts: recs.map(r => ({
        id: r.id as string,
        durationLabel: r.duration_seconds ? `${Math.floor((r.duration_seconds as number) / 60)} min` : null,
        isReady: r.status === 'ready',
        showRevoke: r.status === 'ready' && !isLegalHold,
        isPara: isPara,
      })),
    };
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Headphones className="w-6 h-6 text-htg-sage" />
        <h1 className="text-2xl font-serif font-bold text-htg-fg">Nagrania z sesji</h1>
      </div>

      {/* Privacy banner */}
      <div className="bg-htg-surface rounded-xl p-4 mb-6 flex items-start gap-3 border border-htg-card-border">
        <Info className="w-5 h-5 text-htg-fg-muted shrink-0 mt-0.5" />
        <p className="text-sm text-htg-fg-muted">
          Nagrania z Twoich sesji są dostępne przez okres do 12 miesięcy od daty sesji.
          Ze względów bezpieczeństwa zastrzegamy sobie prawo do skrócenia tego czasu.
          Jeśli chcesz usunąć nagranie lub zgłosić problem, napisz do nas na{' '}
          <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
        </p>
      </div>

      {formattedGroups.length === 0 ? (
        <div className="text-center py-16">
          <Headphones className="w-12 h-12 text-htg-fg-muted/30 mx-auto mb-4" />
          <p className="text-htg-fg-muted">Nie masz jeszcze żadnych nagrań z sesji.</p>
        </div>
      ) : (
        <FullRecordingList groups={formattedGroups} userEmail={userEmail} userId={userId} />
      )}
    </div>
  );
}
