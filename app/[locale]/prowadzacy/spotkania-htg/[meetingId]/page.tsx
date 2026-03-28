import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import MeetingEditor from '@/components/meeting/MeetingEditor';
import { Link } from '@/i18n-config';
import { ArrowLeft } from 'lucide-react';

export default async function EditMeetingPage({ params }: { params: Promise<{ locale: string; meetingId: string }> }) {
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

  const { data: stages } = await db
    .from('htg_meeting_stages')
    .select('*, htg_meeting_questions(*)')
    .eq('meeting_id', meetingId)
    .order('order_index');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/prowadzacy/spotkania-htg" className="text-htg-fg-muted hover:text-htg-fg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-xl font-serif font-semibold text-htg-fg">{meeting.name}</h2>
          <p className="text-sm text-htg-fg-muted">Konfiguracja spotkania</p>
        </div>
      </div>
      <MeetingEditor
        meeting={meeting}
        stages={(stages ?? []) as any[]}
        locale={locale}
        basePath="/prowadzacy/spotkania-htg"
      />
    </div>
  );
}
