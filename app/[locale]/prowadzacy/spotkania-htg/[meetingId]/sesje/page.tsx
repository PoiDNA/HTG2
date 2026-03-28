import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Link } from '@/i18n-config';
import { ArrowLeft, Users2 } from 'lucide-react';
import StartSessionButton from '@/components/meeting/StartSessionButton';
import ParticipantApproval from '@/components/meeting/ParticipantApproval';

export default async function MeetingSessionsPage({ params }: { params: Promise<{ locale: string; meetingId: string }> }) {
  const { locale, meetingId } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const isAdmin = isAdminEmail(user.email ?? '');
  const { staffMember } = await getEffectiveStaffMember();
  if (!isAdmin && !staffMember) redirect(`/${locale}/konto`);

  const db = createSupabaseServiceRole();
  const { data: meeting } = await db.from('htg_meetings').select('*').eq('id', meetingId).single();
  if (!meeting) redirect(`/${locale}/prowadzacy/spotkania-htg`);

  const { data: sessions } = await db
    .from('htg_meeting_sessions')
    .select('id, status, created_at, scheduled_at, moderator_id')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })
    .limit(20);

  // Participants for all sessions
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: allParticipants } = sessionIds.length
    ? await db
        .from('htg_meeting_participants')
        .select('id, session_id, user_id, display_name, email, status, is_moderator')
        .in('session_id', sessionIds)
        .order('status', { ascending: true })
    : { data: [] };

  const participantsBySession: Record<string, any[]> = {};
  (allParticipants ?? []).forEach((p) => {
    if (!participantsBySession[p.session_id]) participantsBySession[p.session_id] = [];
    participantsBySession[p.session_id].push(p);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/prowadzacy/spotkania-htg/${meetingId}`} className="text-htg-fg-muted hover:text-htg-fg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-xl font-serif font-semibold text-htg-fg">{meeting.name} — Sesje</h2>
            <p className="text-sm text-htg-fg-muted">Historia i aktywne sesje</p>
          </div>
        </div>
        <StartSessionButton meetingId={meetingId} locale={locale} />
      </div>

      {(!sessions || sessions.length === 0) ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-12 text-center">
          <p className="text-htg-fg-muted text-sm">Brak sesji. Uruchom pierwszą sesję.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(sessions as any[]).map((s) => {
            const isActive = ['waiting', 'active', 'free_talk'].includes(s.status);
            const participants = participantsBySession[s.id] ?? [];
            const registered = participants.filter((p) => p.status === 'registered');
            const approved = participants.filter((p) => p.status !== 'registered');

            return (
              <div key={s.id} className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
                {/* Session header */}
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-htg-fg-muted/30'}`} />
                      <span className="text-sm font-medium text-htg-fg">
                        {s.status === 'waiting' ? 'Oczekuje' : isActive ? 'W trakcie' : 'Zakończona'}
                      </span>
                    </div>
                    <p className="text-xs text-htg-fg-muted">
                      {s.scheduled_at
                        ? new Date(s.scheduled_at).toLocaleString('pl-PL')
                        : new Date(s.created_at).toLocaleString('pl-PL')}
                      {' · '}
                      <span className="inline-flex items-center gap-1">
                        <Users2 className="w-3 h-3" />
                        {participants.length} / {meeting.max_participants}
                      </span>
                    </p>
                  </div>
                  {isActive && (
                    <Link
                      href={`/spotkanie/${s.id}`}
                      className="px-4 py-2 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 transition-colors"
                    >
                      Wejdź
                    </Link>
                  )}
                </div>

                {/* Participants list */}
                {participants.length > 0 && (
                  <div className="border-t border-htg-card-border px-4 pb-4 pt-3">
                    {/* Registered (awaiting approval) */}
                    {registered.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wide mb-2">
                          Oczekujące zapisy ({registered.length})
                        </p>
                        <div className="space-y-2">
                          {registered.map((p) => (
                            <ParticipantApproval
                              key={p.id}
                              participantId={p.id}
                              sessionId={s.id}
                              displayName={p.display_name ?? p.email ?? p.user_id}
                              email={p.email}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Approved/joined participants */}
                    {approved.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wide mb-2">
                          Uczestnicy ({approved.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {approved.map((p) => (
                            <span
                              key={p.id}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium
                                ${p.is_moderator
                                  ? 'bg-htg-warm/15 text-htg-warm'
                                  : 'bg-htg-surface text-htg-fg-muted'
                                }`}
                            >
                              {p.display_name ?? p.email ?? p.user_id}
                              {p.is_moderator && ' · mod'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
