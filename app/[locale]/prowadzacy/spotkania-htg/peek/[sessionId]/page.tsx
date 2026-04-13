import { setRequestLocale } from 'next-intl/server';
import { locales, redirect } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import PeekRoomClient from './PeekRoomClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function PeekPage({
  params,
}: { params: Promise<{ locale: string; sessionId: string }> }) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);

  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return redirect({href: '/login', locale});

  const isAdmin       = isAdminEmail(user.email ?? '');
  const isPractitioner = staffMember?.role === 'practitioner';
  if (!isAdmin && !isPractitioner) return redirect({href: '/prowadzacy', locale});

  const db = createSupabaseServiceRole();
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select(`
      id, status, room_name, started_at,
      htg_meetings ( name, type )
    `)
    .eq('id', sessionId)
    .single();

  if (!session || session.status === 'ended') {
    return redirect({href: '/prowadzacy/spotkania-htg', locale});
  }

  return (
    <PeekRoomClient
      sessionId={sessionId}
      meetingName={(session as any).htg_meetings?.name ?? 'Spotkanie HTG'}
      locale={locale}
      backUrl={`/${locale}/prowadzacy/spotkania-htg`}
    />
  );
}
