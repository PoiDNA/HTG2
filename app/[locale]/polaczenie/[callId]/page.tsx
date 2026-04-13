import { redirect } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import QuickCallRoom from './QuickCallRoom';

export default async function PolaczeniePage({
  params,
}: {
  params: Promise<{ locale: string; callId: string }>;
}) {
  const { locale, callId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect({href: '/login', locale});

  const db = createSupabaseServiceRole();

  // Verify call exists and is active
  const { data: call } = await db
    .from('quick_calls')
    .select('id, created_by, status')
    .eq('id', callId)
    .single();

  if (!call || call.status === 'ended') {
    return redirect({href: '/konto', locale});
  }

  // Verify user is a participant
  const { data: participant } = await db
    .from('quick_call_participants')
    .select('id')
    .eq('call_id', callId)
    .eq('user_id', user.id)
    .single();

  if (!participant) return redirect({href: '/konto', locale});

  const isCreator = call.created_by === user.id;
  const isStaff   = isAdminEmail(user.email ?? '') || isStaffEmail(user.email ?? '');
  const backUrl   = `/${locale}/${isStaff ? 'prowadzacy' : 'konto'}`;

  return (
    <QuickCallRoom
      callId={callId}
      isCreator={isCreator}
      locale={locale}
      backUrl={backUrl}
    />
  );
}
