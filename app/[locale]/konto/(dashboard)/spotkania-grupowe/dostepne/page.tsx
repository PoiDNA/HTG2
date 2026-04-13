import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales, Link } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Users2, ArrowLeft, CalendarDays, Clock } from 'lucide-react';
import RegisterButton from '@/components/meeting/RegisterButton';
import ActiveMeetingBanner from '@/components/meeting/ActiveMeetingBanner';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function DostepneSpotkania({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId } = await getEffectiveUser();

  const db = createSupabaseServiceRole();

  // All waiting sessions from meetings that allow self-registration
  const { data: sessions } = await db
    .from('htg_meeting_sessions')
    .select(`
      id, status, scheduled_at, created_at,
      htg_meetings!inner ( id, name, meeting_type, max_participants, allow_self_register )
    `)
    .eq('status', 'waiting')
    .eq('htg_meetings.allow_self_register', true)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(50);

  // Current user's registrations for these sessions
  const sessionIds = (sessions ?? []).map((s: any) => s.id);
  const { data: myParticipations } = sessionIds.length
    ? await db
        .from('htg_meeting_participants')
        .select('session_id, status')
        .eq('user_id', userId)
        .in('session_id', sessionIds)
    : { data: [] };

  const myStatusMap: Record<string, string> = {};
  (myParticipations ?? []).forEach((p: any) => {
    myStatusMap[p.session_id] = p.status;
  });

  // Participant count per session
  const { data: participantCounts } = sessionIds.length
    ? await db
        .from('htg_meeting_participants')
        .select('session_id')
        .in('session_id', sessionIds)
    : { data: [] };

  const countMap: Record<string, number> = {};
  (participantCounts ?? []).forEach((p: any) => {
    countMap[p.session_id] = (countMap[p.session_id] ?? 0) + 1;
  });

  const list = sessions ?? [];

  return (
    <div>
      <ActiveMeetingBanner locale={locale} />
      <Link
        href="/konto/spotkania-grupowe"
        className="inline-flex items-center gap-2 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Moje spotkania
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users2 className="w-6 h-6 text-htg-sage" />
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Dostępne spotkania HTG</h2>
        </div>
        <p className="text-htg-fg-muted text-sm">Zapisz się na nadchodzące spotkanie grupowe</p>
      </div>

      {list.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-10 text-center">
          <Users2 className="w-10 h-10 text-htg-fg-muted/40 mx-auto mb-3" />
          <p className="text-htg-fg-muted">Brak dostępnych spotkań. Sprawdź ponownie później.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((s: any) => {
            const meeting = s.htg_meetings;
            const myStatus = myStatusMap[s.id];
            const participantCount = countMap[s.id] ?? 0;
            const isFull = participantCount >= meeting.max_participants;

            return (
              <div key={s.id} className="bg-htg-card border border-htg-card-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-semibold text-htg-fg text-lg">{meeting.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-htg-fg-muted">
                      {s.scheduled_at ? (
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4" />
                          {new Date(s.scheduled_at).toLocaleString('pl-PL', {
                            day: 'numeric', month: 'long', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          Termin do ustalenia
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Users2 className="w-4 h-4" />
                        {participantCount} / {meeting.max_participants} uczestników
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {myStatus === 'approved' && (
                      <span className="text-xs px-3 py-1.5 rounded-lg bg-htg-sage/15 text-htg-sage font-medium">
                        Zatwierdzono
                      </span>
                    )}
                    {myStatus === 'joined' && (
                      <span className="text-xs px-3 py-1.5 rounded-lg bg-htg-sage/15 text-htg-sage font-medium">
                        Dołączono
                      </span>
                    )}
                    {(myStatus === 'registered' || !myStatus) && (
                      <RegisterButton
                        sessionId={s.id}
                        initialRegistered={myStatus === 'registered'}
                        isFull={isFull && !myStatus}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
