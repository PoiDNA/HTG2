import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales, Link } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { ArrowLeft } from 'lucide-react';
import MeetingPlayerClient from './MeetingPlayerClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function MeetingRecordingPage({
  params,
}: { params: Promise<{ locale: string; sessionId: string }> }) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);

  const { userId, supabase } = await getEffectiveUser();

  // Verify participation
  const { data: participation } = await supabase
    .from('htg_meeting_participants')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!participation) redirect(`/${locale}/konto/spotkania-grupowe`);

  // Fetch session + recording
  const { data: session } = await supabase
    .from('htg_meeting_sessions')
    .select(`
      id, started_at, ended_at,
      htg_meetings ( name, type ),
      htg_meeting_recordings ( bunny_video_id, bunny_library_id, duration_seconds )
    `)
    .eq('id', sessionId)
    .single();

  if (!session) redirect(`/${locale}/konto/spotkania-grupowe`);

  // Fetch speaking events for timeline
  const { data: events } = await supabase
    .from('htg_speaking_events')
    .select('user_id, display_name, started_offset_seconds, ended_offset_seconds')
    .eq('session_id', sessionId)
    .order('started_offset_seconds');

  const rec = (session as any).htg_meeting_recordings?.[0];

  return (
    <div>
      <Link
        href={`/${locale}/konto/spotkania-grupowe`}
        className="inline-flex items-center gap-2 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Spotkania grupowe
      </Link>

      <div className="mb-6">
        <h2 className="text-2xl font-serif font-bold text-htg-fg">
          {(session as any).htg_meetings?.name}
        </h2>
        {session.started_at && (
          <p className="text-htg-fg-muted mt-1">
            {new Date(session.started_at).toLocaleDateString('pl-PL', {
              day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>

      <MeetingPlayerClient
        bunnyVideoId={rec?.bunny_video_id ?? null}
        bunnyLibraryId={rec?.bunny_library_id ?? null}
        durationSeconds={rec?.duration_seconds ?? 0}
        speakingEvents={events ?? []}
      />
    </div>
  );
}
