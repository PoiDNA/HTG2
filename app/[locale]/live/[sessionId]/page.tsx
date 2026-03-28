import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
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

  // Use service role to bypass RLS — we verify access manually below
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch live session with its booking (use FK hint to resolve ambiguity)
  const { data: session, error } = await adminClient
    .from('live_sessions')
    .select('*, booking:bookings!live_sessions_booking_id_fkey(user_id)')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    redirect(`/${locale}/konto`);
  }

  // Verify access: must be staff, booking owner, or accepted companion
  const staff = isStaffEmail(user.email ?? '');
  const isBookingOwner = (session as any).booking?.user_id === user.id;

  let isCompanion = false;
  if (!staff && !isBookingOwner && (session as any).booking_id) {
    const { data: companion } = await adminClient
      .from('booking_companions')
      .select('id')
      .eq('booking_id', (session as any).booking_id)
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .maybeSingle();
    isCompanion = !!companion;
  }

  if (!staff && !isBookingOwner && !isCompanion) {
    redirect(`/${locale}/konto`);
  }

  // If session is ended, redirect to account
  if (session.phase === 'ended') {
    redirect(`/${locale}/konto`);
  }

  // Strip the joined booking data before passing to client
  const { booking: _, ...sessionData } = session as any;

  return (
    <LiveRoom
      session={sessionData as LiveSession}
      isStaff={staff}
    />
  );
}
