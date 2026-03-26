import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/roles';
import type { LiveSession } from '@/lib/live/types';
import LiveRoom from './LiveRoom';

interface PageProps {
  params: Promise<{
    locale: string;
    sessionId: string;
  }>;
}

export default async function LiveSessionPage({ params }: PageProps) {
  const { locale, sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch live session
  const { data: session, error } = await supabase
    .from('live_sessions')
    .select('*, bookings!inner(user_id)')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    redirect(`/${locale}/konto`);
  }

  // Verify access: must be staff or booking owner
  const staff = isStaffEmail(user.email ?? '');
  const isBookingOwner = session.bookings?.user_id === user.id;

  if (!staff && !isBookingOwner) {
    redirect(`/${locale}/konto`);
  }

  // If session is ended, redirect to account
  if (session.phase === 'ended') {
    redirect(`/${locale}/konto`);
  }

  // Strip the joined bookings data before passing to client
  const { bookings: _, ...sessionData } = session;

  return (
    <LiveRoom
      session={sessionData as LiveSession}
      isStaff={staff}
    />
  );
}
