import { redirect } from 'next/navigation';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
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

  const staff = isStaffEmail(user.email ?? '');

  // Service role needed: live_sessions may not have RLS policies allowing user reads,
  // and we need to join booking ownership + companion check across tables.
  // Auth is verified above (user must be logged in) and access is checked below.
  const adminClient = createSupabaseServiceRole();

  // Fetch only the columns LiveRoom needs + booking user_id for access check
  const { data: session, error } = await adminClient
    .from('live_sessions')
    .select(`
      id, booking_id, slot_id, room_name, room_sid, phase, phase_changed_at,
      started_at, ended_at,
      egress_wstep_id, egress_sesja_id, egress_sesja_tracks_ids, egress_podsumowanie_id,
      recording_wstep_url, recording_sesja_url, recording_sesja_tracks, recording_podsumowanie_url,
      bunny_sesja_video_id, notes, metadata, created_at,
      booking:bookings!live_sessions_booking_id_fkey(user_id)
    `)
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    redirect(`/${locale}/konto`);
  }

  // Access check: must be staff, booking owner, or accepted companion
  const isBookingOwner = (session as any).booking?.user_id === user.id;

  if (!staff && !isBookingOwner) {
    // Only query companions if actually needed (non-staff, non-owner)
    let isCompanion = false;
    if ((session as any).booking_id) {
      const { data: companion } = await adminClient
        .from('booking_companions')
        .select('id')
        .eq('booking_id', (session as any).booking_id)
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .maybeSingle();
      isCompanion = !!companion;
    }

    if (!isCompanion) {
      redirect(`/${locale}/konto`);
    }
  }

  if (session.phase === 'ended') {
    redirect(`/${locale}/konto`);
  }

  const { booking: _, ...sessionData } = session as any;

  return (
    <LiveRoom
      session={sessionData as LiveSession}
      isStaff={staff}
    />
  );
}
