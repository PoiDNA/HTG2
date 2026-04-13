import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales, Link } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { ArrowLeft, Users2, PlayCircle, Clock } from 'lucide-react';
import ActiveMeetingBanner from '@/components/meeting/ActiveMeetingBanner';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SpotkaniaDane({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId, supabase } = await getEffectiveUser();

  // Get all meeting sessions where user was a participant
  const { data: participations } = await supabase
    .from('htg_meeting_participants')
    .select(`
      session_id,
      htg_meeting_sessions!inner (
        id, status, started_at, ended_at,
        htg_meetings!inner ( name, type ),
        htg_meeting_recordings ( id, duration_seconds )
      )
    `)
    .eq('user_id', userId)
    .order('session_id', { ascending: false });

  const meetings = (participations ?? []).map((p: any) => p.htg_meeting_sessions);

  return (
    <div>
      <ActiveMeetingBanner locale={locale} />
      <Link
        href="/konto"
        className="inline-flex items-center gap-2 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Moje konto
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users2 className="w-6 h-6 text-htg-sage" />
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Spotkania grupowe HTG</h2>
        </div>
        <p className="text-htg-fg-muted">Nagrania Twoich spotkań grupowych</p>
      </div>

      {meetings.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <Users2 className="w-10 h-10 text-htg-fg-muted/40 mx-auto mb-3" />
          <p className="text-htg-fg-muted">Nie uczestniczyłeś/aś jeszcze w żadnym spotkaniu grupowym.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m: any) => {
            const hasRecording = m.htg_meeting_recordings?.length > 0;
            const rec = m.htg_meeting_recordings?.[0];
            const dur = rec?.duration_seconds
              ? `${Math.floor(rec.duration_seconds / 60)} min`
              : null;
            return (
              <div
                key={m.id}
                className="bg-htg-card border border-htg-card-border rounded-xl p-5 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-htg-fg">{m.htg_meetings?.name}</p>
                  <p className="text-sm text-htg-fg-muted mt-0.5">
                    {m.started_at
                      ? new Date(m.started_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Nierozpoczęte'}
                    {dur && <span className="ml-3 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{dur}</span>}
                  </p>
                </div>
                {hasRecording ? (
                  <Link
                    href={{pathname: '/konto/spotkania-grupowe/[sessionId]', params: {sessionId: m.id}}}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-htg-sage/15 hover:bg-htg-sage/25 text-htg-sage text-sm font-medium transition-colors"
                  >
                    <PlayCircle className="w-4 h-4" />
                    Odtwórz
                  </Link>
                ) : (
                  <span className="text-xs text-htg-fg-muted/60 px-3 py-1.5 rounded-lg bg-htg-surface">
                    Brak nagrania
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
