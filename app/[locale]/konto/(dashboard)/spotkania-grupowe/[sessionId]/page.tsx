import { setRequestLocale } from 'next-intl/server';
import { locales, Link, redirect } from '@/i18n-config';
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

  if (!participation) return redirect({href: '/konto/spotkania-grupowe', locale});

  // Fetch session + related meeting name
  const { data: session } = await supabase
    .from('htg_meeting_sessions')
    .select(`
      id, started_at, ended_at,
      htg_meetings ( name, type )
    `)
    .eq('id', sessionId)
    .single();

  if (!session) return redirect({href: '/konto/spotkania-grupowe', locale});

  // PR #7: fetch composite recording from recordings_v2. Status must be 'ready'
  // for playback (access check + URL token comes from htg-meeting-recording-token).
  const { data: recording } = await supabase
    .from('htg_meeting_recordings_v2' as never)
    .select('id, duration_seconds, status')
    .eq('meeting_session_id', sessionId)
    .eq('recording_kind', 'composite')
    .eq('status', 'ready')
    .maybeSingle();

  // Fetch speaking events for timeline
  const { data: events } = await supabase
    .from('htg_speaking_events')
    .select('user_id, display_name, started_offset_seconds, ended_offset_seconds')
    .eq('session_id', sessionId)
    .order('started_offset_seconds');

  const rec = recording as { id?: string; duration_seconds?: number | null } | null;

  return (
    <div>
      <Link
        href="/konto/spotkania-grupowe"
        className="inline-flex items-center gap-2 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Spotkania grupowe
      </Link>

      <div className="mb-6">
        <h2 className="text-2xl font-serif font-bold text-htg-fg">
          {(session as { htg_meetings?: { name?: string } }).htg_meetings?.name}
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
        recordingId={rec?.id ?? null}
        durationSeconds={rec?.duration_seconds ?? 0}
        speakingEvents={events ?? []}
      />
    </div>
  );
}
