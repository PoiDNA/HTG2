import { redirect } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import MeetingRoom from './MeetingRoom';

export default async function SpotkaniePage({ params }: { params: Promise<{ locale: string; sessionId: string }> }) {
  const { locale, sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect({href: '/login', locale});

  const db = createSupabaseServiceRole();

  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('*, htg_meetings(name)')
    .eq('id', sessionId)
    .single();

  if (!session || session.status === 'ended') return redirect({href: '/konto', locale});

  const isAdmin = isAdminEmail(user.email ?? '');

  // Check participant
  let participant = null;
  if (!isAdmin) {
    const { data } = await db
      .from('htg_meeting_participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (!data) return redirect({href: '/konto', locale});
    participant = data;
  }

  const { data: profile } = await db
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .single();

  const displayName = profile?.display_name || profile?.email || user.email || 'Uczestnik';
  const isModerator = isAdmin || participant?.is_moderator || false;

  return (
    <MeetingRoom
      sessionId={sessionId}
      userId={user.id}
      displayName={displayName}
      isModerator={isModerator}
      meetingName={(session.htg_meetings as any)?.name ?? 'Spotkanie HTG'}
      locale={locale}
    />
  );
}
