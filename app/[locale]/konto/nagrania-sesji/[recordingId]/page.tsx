import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { redirect } from 'next/navigation';
import VideoPlayer from '@/components/video/VideoPlayer';
import { Link } from '@/i18n-config';
import { ArrowLeft, AlertTriangle, Clock } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RecordingPlayerPage({
  params,
}: {
  params: Promise<{ locale: string; recordingId: string }>;
}) {
  const { locale, recordingId } = await params;
  setRequestLocale(locale);

  const { userId } = await getEffectiveUser();
  const db = createSupabaseServiceRole();

  // Check access
  const { data: access } = await db
    .from('booking_recording_access')
    .select('revoked_at')
    .eq('recording_id', recordingId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!access || access.revoked_at) {
    redirect(`/${locale}/konto/nagrania-sesji`);
  }

  // Get recording
  const { data: recording } = await db
    .from('booking_recordings')
    .select('id, title, session_type, session_date, status, expires_at, recording_started_at, legal_hold')
    .eq('id', recordingId)
    .single();

  if (!recording) {
    redirect(`/${locale}/konto/nagrania-sesji`);
  }

  // Para revoke check
  const isPara = recording.session_type === 'natalia_para';
  if (isPara) {
    const { data: anyRevoked } = await db
      .from('booking_recording_access')
      .select('id')
      .eq('recording_id', recordingId)
      .not('revoked_at', 'is', null)
      .limit(1)
      .maybeSingle();

    if (anyRevoked) {
      return (
        <div className="max-w-2xl mx-auto py-16 px-4 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-serif font-bold text-htg-fg mb-2">Nagranie niedostępne</h1>
          <p className="text-htg-fg-muted mb-6">
            Dostęp do tego nagrania jest wstrzymany. Napisz do nas, a odezwiemy się w ciągu 48h:&nbsp;
            <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>
          </p>
          <Link href="/konto/nagrania-sesji" className="text-htg-sage hover:underline">
            Wróć do listy nagrań
          </Link>
        </div>
      );
    }
  }

  // Status check
  if (recording.status !== 'ready') {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <Clock className="w-12 h-12 text-htg-fg-muted/30 mx-auto mb-4" />
        <h1 className="text-xl font-serif font-bold text-htg-fg mb-2">Nagranie w przygotowaniu</h1>
        <p className="text-htg-fg-muted mb-6">
          Twoje nagranie jest przetwarzane. Wróć za ok. 30 minut.
        </p>
        <Link href="/konto/nagrania-sesji" className="text-htg-sage hover:underline">
          Wróć do listy nagrań
        </Link>
      </div>
    );
  }

  // Get user email for watermark
  const { data: profile } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();

  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const userEmail = authUser?.user?.email ?? '';

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Link
        href="/konto/nagrania-sesji"
        className="flex items-center gap-2 text-sm text-htg-fg-muted hover:text-htg-fg mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Wróć do listy nagrań
      </Link>

      <h1 className="text-xl font-serif font-bold text-htg-fg mb-2">
        {recording.title ?? 'Nagranie z sesji'}
      </h1>

      <div className="flex items-center gap-3 text-sm text-htg-fg-muted mb-4">
        {recording.session_date && (
          <span>{new Date(recording.session_date).toLocaleDateString('pl-PL')}</span>
        )}
        {recording.expires_at && !recording.legal_hold && (
          <span>Dostępne do {new Date(recording.expires_at).toLocaleDateString('pl-PL')}</span>
        )}
        {recording.legal_hold && (
          <span className="text-amber-400">Nagranie objęte blokadą prawną</span>
        )}
      </div>

      {recording.recording_started_at && (
        <p className="text-xs text-amber-500/80 mb-4">
          Nagranie rozpoczęło się o{' '}
          {new Date(recording.recording_started_at).toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          , po uzyskaniu zgody wszystkich uczestników.
        </p>
      )}

      <div className="rounded-xl overflow-hidden bg-black">
        <VideoPlayer
          sessionId={recordingId}
          tokenEndpoint="/api/video/booking-recording-token"
          userEmail={userEmail}
          userId={userId}
        />
      </div>

      <p className="text-xs text-htg-fg-muted mt-4">
        Udostępnianie nagrania osobom trzecim jest zabronione.
      </p>
    </div>
  );
}
