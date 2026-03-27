import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Link } from '@/i18n-config';
import { Video, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { CreatePublicationButton } from '@/components/publikacja/CreatePublicationButton';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function NagraniePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = createSupabaseServiceRole();

  // Fetch live sessions that have any recording (tracks or composite)
  const { data: liveSessions } = await supabase
    .from('live_sessions')
    .select(`
      id, room_name, created_at, phase,
      recording_sesja_url, recording_sesja_tracks,
      egress_sesja_tracks_ids,
      booking:bookings!inner(id, session_type, user_id)
    `)
    .or('recording_sesja_url.not.is.null,recording_sesja_tracks.not.is.null')
    .order('created_at', { ascending: false })
    .limit(100);

  // Fetch existing publications linked to these sessions
  const sessionIds = (liveSessions || []).map((s: any) => s.id);
  const { data: linkedPublications } = sessionIds.length > 0
    ? await supabase
        .from('session_publications')
        .select('id, title, status, live_session_id')
        .in('live_session_id', sessionIds)
    : { data: [] };

  const pubByLiveSession = new Map(
    (linkedPublications || []).map((p: any) => [p.live_session_id, p])
  );

  // Fetch user profiles for display
  const userIds = [...new Set(
    (liveSessions || []).map((s: any) =>
      Array.isArray(s.booking) ? s.booking[0]?.user_id : s.booking?.user_id
    ).filter(Boolean)
  )];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, email, display_name').in('id', userIds as string[])
    : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const SESSION_LABELS: Record<string, string> = {
    natalia_solo: 'Sesja 1:1 z Natalią',
    natalia_agata: 'Sesja z Natalią i Agatą',
    natalia_justyna: 'Sesja z Natalią i Justyną',
  };

  const STATUS_LABELS: Record<string, string> = {
    raw: 'Do edycji',
    editing: 'W edycji',
    edited: 'Gotowe',
    mastering: 'Mastering',
    published: 'Opublikowane',
  };

  const unlinked = (liveSessions || []).filter((s: any) => !pubByLiveSession.has(s.id));
  const linked = (liveSessions || []).filter((s: any) => pubByLiveSession.has(s.id));

  function getTrackCount(s: any): number {
    const tracks = s.recording_sesja_tracks as Record<string, string> | null;
    return tracks ? Object.keys(tracks).length : 0;
  }
  function getUserId(s: any): string | null {
    const b = Array.isArray(s.booking) ? s.booking[0] : s.booking;
    return b?.user_id || null;
  }
  function getSessionType(s: any): string {
    const b = Array.isArray(s.booking) ? s.booking[0] : s.booking;
    return SESSION_LABELS[b?.session_type] || b?.session_type || '—';
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Video className="w-6 h-6 text-htg-indigo" />
        <div>
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Nagrania LiveKit</h2>
          <p className="text-sm text-htg-fg-muted">
            Sesje z nagraniami — {unlinked.length} bez publikacji, {linked.length} podłączone
          </p>
        </div>
      </div>

      {/* Unlinked — need publication */}
      {unlinked.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-htg-fg mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400" />
            Bez publikacji ({unlinked.length})
          </h3>
          <div className="space-y-3">
            {unlinked.map((s: any) => {
              const userId = getUserId(s);
              const profile = userId ? (profileMap.get(userId) as any) : null;
              const trackCount = getTrackCount(s);
              const hasComposite = !!s.recording_sesja_url;
              return (
                <div
                  key={s.id}
                  className="bg-htg-card border border-htg-card-border rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-htg-fg text-sm">
                        {new Date(s.created_at).toLocaleDateString('pl-PL', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                        {getSessionType(s)}
                      </span>
                    </div>
                    <p className="text-xs text-htg-fg-muted mt-1">
                      {profile?.display_name || profile?.email || '—'}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-htg-fg-muted">
                      {trackCount > 0 && (
                        <span className="text-htg-sage font-medium">
                          🎵 {trackCount} ścieżk{trackCount === 1 ? 'a' : 'i'} osobne
                        </span>
                      )}
                      {hasComposite && (
                        <span className="text-htg-indigo font-medium">🎬 nagranie composite</span>
                      )}
                      {!trackCount && !hasComposite && (
                        <span className="text-yellow-500">⚠ brak nagrań</span>
                      )}
                    </div>
                  </div>

                  <CreatePublicationButton liveSessionId={s.id} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Linked — already have publication */}
      {linked.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-htg-fg-muted mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-htg-sage" />
            Podłączone do publikacji ({linked.length})
          </h3>
          <div className="space-y-2 opacity-70">
            {linked.map((s: any) => {
              const pub = pubByLiveSession.get(s.id) as any;
              return (
                <div
                  key={s.id}
                  className="bg-htg-card border border-htg-card-border rounded-xl px-4 py-3 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-htg-fg truncate">{pub.title || pub.id.slice(0, 8)}</p>
                    <p className="text-xs text-htg-fg-muted">
                      {new Date(s.created_at).toLocaleDateString('pl-PL')}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    pub.status === 'published' ? 'bg-green-900/30 text-green-400' :
                    pub.status === 'editing' ? 'bg-blue-900/30 text-blue-400' :
                    'bg-htg-surface text-htg-fg-muted'
                  }`}>
                    {STATUS_LABELS[pub.status] || pub.status}
                  </span>
                  <Link
                    href={`/publikacja/sesje/${pub.id}` as any}
                    className="p-2 rounded-lg hover:bg-htg-surface text-htg-fg-muted hover:text-htg-fg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(liveSessions || []).length === 0 && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-12 text-center">
          <Video className="w-12 h-12 text-htg-fg-muted mx-auto mb-4 opacity-30" />
          <p className="text-htg-fg-muted">Brak sesji LiveKit z nagraniami</p>
        </div>
      )}
    </div>
  );
}
