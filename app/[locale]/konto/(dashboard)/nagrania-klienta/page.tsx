import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isStaffEmail, isAdminEmail } from '@/lib/roles';
import { signPrivateCdnUrl } from '@/lib/bunny';
import RecordingsPair from '@/components/live/RecordingsPair';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import { Video } from 'lucide-react';

// Sentinel UUID used in client_recording_audit.recording_id for "viewed_list"
// events that don't reference a specific recording. Matches the SYSTEM_ACTOR
// pattern already used in booking_recording_audit.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// TTL for server-side signed playback URLs (4 hours = 14400s).
// Matches signPrivateCdnUrl default and booking_recordings convention.
// Long enough that a user keeping the page open through a normal session
// won't hit a 403, short enough that a leaked URL expires quickly.
const PLAYBACK_TTL_SECONDS = 14400;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function ClientRecordingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId, isImpersonating } = await getEffectiveUser();
  const realSupabase = await createSupabaseServer();
  const { data: { user } } = await realSupabase.auth.getUser();
  const admin = createSupabaseServiceRole();

  const staff = !isImpersonating && user ? isStaffEmail(user.email ?? '') : false;
  const admin_user = !isImpersonating && user ? isAdminEmail(user.email ?? '') : false;

  // Need-to-know access model for staff (Faza 6):
  // - Admin (htg@htg.cyou)          → sees all non-deleted recordings
  // - Practitioner (Natalia, single) → sees all non-deleted recordings (single
  //                                    practitioner in HTG2; all sessions are hers)
  // - Assistant (Operatorka)         → sees only recordings from bookings where
  //                                    she was the assigned assistant on the slot
  //                                    (booking_slots.assistant_id = staff_members.id)
  // - Other staff (unlikely)         → sees nothing (fail-closed)
  //
  // All of these are enforced in application code (this function), not at the
  // database layer, because the entire data access goes through service_role
  // which bypasses RLS anyway (see migration 049 end-state).
  //
  // The filter is only applied to assistants — for admin and practitioner it's
  // effectively a no-op because they see everything. For assistants we need to
  // join through bookings → booking_slots → assistant_id.

  // Resolve the viewer's staff_members row (for role + assistant_id lookups).
  // Use `user.id` (the real session user), not userId (which could be impersonated).
  let viewerStaffRole: 'practitioner' | 'operator' | null = null;
  let viewerStaffId: string | null = null;
  if (staff && user && !admin_user) {
    const { data: staffRow } = await admin
      .from('staff_members')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (staffRow) {
      viewerStaffRole = staffRow.role as 'practitioner' | 'operator';
      viewerStaffId = staffRow.id;
    }
  }

  // Fetch recordings. Soft-deleted rows (deleted_at IS NOT NULL) are filtered
  // out for everyone — admin restore is a separate future flow.
  let recordings: any[] = [];
  if (staff) {
    // ─── Admin or practitioner: see all ───────────────────────────────────
    if (admin_user || viewerStaffRole === 'practitioner') {
      const { data } = await admin
        .from('client_recordings')
        .select('*, booking:bookings(session_type, slot:booking_slots(slot_date, start_time, assistant_id))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);
      recordings = data || [];
    }
    // ─── Assistant: filter by slot.assistant_id ───────────────────────────
    else if (viewerStaffRole === 'operator' && viewerStaffId) {
      // Two-step fetch because Supabase PostgREST doesn't support filtering
      // on nested joined columns in a single query reliably. Step 1: find all
      // bookings where this assistant was assigned. Step 2: fetch recordings
      // for those bookings.
      const { data: myBookings } = await admin
        .from('bookings')
        .select('id, booking_slots!inner(assistant_id)')
        .eq('booking_slots.assistant_id', viewerStaffId);
      const myBookingIds = (myBookings || []).map(b => b.id);

      if (myBookingIds.length > 0) {
        const { data } = await admin
          .from('client_recordings')
          .select('*, booking:bookings(session_type, slot:booking_slots(slot_date, start_time, assistant_id))')
          .in('booking_id', myBookingIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(100);
        recordings = data || [];
      }
    }
    // ─── Other staff (unlikely — fail closed) ─────────────────────────────
    else {
      recordings = [];
    }
  } else {
    // User sees own recordings (or impersonated user's recordings)
    const { data } = await admin
      .from('client_recordings')
      .select('*, booking:bookings(session_type, slot:booking_slots(slot_date, start_time, assistant_id))')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    recordings = data || [];
  }

  // Audit: log staff list view (Faza 6). Non-blocking — if the insert fails,
  // the page still renders. Uses nil UUID sentinel for recording_id because
  // this event isn't tied to a specific recording. Only logged for actual
  // staff views (not regular clients viewing their own) because:
  //   (a) client viewing own data is implicit via auth, no audit value
  //   (b) staff access to client data is exactly what we want to track
  if (staff && user) {
    try {
      await admin.from('client_recording_audit').insert({
        recording_id: NIL_UUID,
        actor_id: user.id,
        action: 'viewed_list',
        details: {
          is_admin: admin_user,
          staff_role: viewerStaffRole,
          recording_count: recordings.length,
          impersonating: isImpersonating,
        },
      });
    } catch (auditErr) {
      console.error('[nagrania-klienta] viewed_list audit write failed (non-fatal):', auditErr);
    }
  }

  // Sign playback URLs server-side via signPrivateCdnUrl with 4h TTL.
  // storage_url is now a path-only string (e.g. "client-recordings/<uid>/<bid>/<file>.webm")
  // pointing into the htg2 storage zone, served via the private htg-private.b-cdn.net
  // pull zone with token authentication. Each card in RecordingsPair receives a freshly
  // signed playback_url at SSR time — no client-side token roundtrip needed.
  recordings = recordings.map(rec => ({
    ...rec,
    playback_url: signPrivateCdnUrl(rec.storage_url, PLAYBACK_TTL_SECONDS),
  }));

  // Fetch active share token counts per recording (Faza 7). A token is "active"
  // when revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()).
  // Shown to the owner so they know how many outstanding share links exist and
  // whether the "Cofnij wszystkie linki" button should appear.
  //
  // Only fetches for the non-staff case (owner view). Staff don't see sharing
  // controls at all (isOwner=false), so there's no need to compute counts for
  // them.
  if (!staff && recordings.length > 0) {
    const recordingIds = recordings.map(r => r.id);
    const nowIso = new Date().toISOString();
    const { data: shares } = await admin
      .from('client_recording_shares')
      .select('recording_id, expires_at')
      .in('recording_id', recordingIds)
      .is('revoked_at', null);
    const activeCountByRecording = new Map<string, number>();
    for (const s of shares ?? []) {
      if (s.expires_at && s.expires_at <= nowIso) continue; // expired
      const current = activeCountByRecording.get(s.recording_id) ?? 0;
      activeCountByRecording.set(s.recording_id, current + 1);
    }
    recordings = recordings.map(rec => ({
      ...rec,
      active_shares_count: activeCountByRecording.get(rec.id) ?? 0,
    }));
  }

  // Fetch profile names for staff view
  const userIds = [...new Set(recordings.map(r => r.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await admin.from('profiles').select('id, email, display_name').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  // Group by booking
  const byBooking = new Map<string, { before?: any; after?: any; meta: any }>();
  for (const rec of recordings) {
    const key = rec.booking_id;
    if (!byBooking.has(key)) {
      const booking = rec.booking;
      const slot = Array.isArray(booking?.slot) ? booking.slot[0] : booking?.slot;
      const profile = profileMap.get(rec.user_id);
      byBooking.set(key, {
        meta: {
          clientName: profile?.display_name || profile?.email || '',
          sessionDate: slot?.slot_date ? `${slot.slot_date} ${slot.start_time?.slice(0, 5) || ''}` : '',
          sessionType: booking?.session_type || '',
        },
      });
    }
    const entry = byBooking.get(key)!;
    if (rec.type === 'before') entry.before = rec;
    if (rec.type === 'after') entry.after = rec;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Video className="w-6 h-6 text-htg-indigo" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Nagrania przed / po sesji</h2>
      </div>

      {byBooking.size === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <Video className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted">Brak nagrań. Nagrania tworzysz w poczekalni (przed sesją) i po zakończeniu sesji.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(byBooking.entries()).map(([bookingId, { before, after, meta }]) => (
            <div key={bookingId} className="bg-htg-card border border-htg-card-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-sm">
                {staff && meta.clientName && (
                  <span className="font-medium text-htg-fg">{meta.clientName}</span>
                )}
                <span className="text-htg-fg-muted">{meta.sessionDate}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                  {SESSION_CONFIG[meta.sessionType as SessionType]?.labelShort || meta.sessionType}
                </span>
              </div>
              <RecordingsPair before={before} after={after} isOwner={!staff} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
