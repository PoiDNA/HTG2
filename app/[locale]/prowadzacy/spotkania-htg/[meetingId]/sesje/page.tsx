import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Link } from '@/i18n-config';
import { ArrowLeft } from 'lucide-react';
import StartSessionButton from '@/components/meeting/StartSessionButton';

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
    .select('*, htg_meeting_participants(count)')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })
    .limit(20);

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
        <div className="space-y-3">
          {(sessions as any[]).map((s) => {
            const isActive = ['waiting', 'active', 'free_talk'].includes(s.status);
            return (
              <div key={s.id} className="bg-htg-card border border-htg-card-border rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-htg-fg-muted/30'}`} />
                    <span className="text-sm font-medium text-htg-fg">
                      {isActive ? 'W trakcie' : 'Zakończona'}
                    </span>
                  </div>
                  <p className="text-xs text-htg-fg-muted">
                    {new Date(s.created_at).toLocaleString('pl-PL')}
                    {s.htg_meeting_participants?.[0]?.count != null && ` · ${s.htg_meeting_participants[0].count} uczestników`}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
