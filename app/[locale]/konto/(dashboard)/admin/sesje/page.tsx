import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { canEditSesje } from '@/lib/staff-config';
import { redirect } from '@/i18n-config';
import AdminSessionList from './AdminSessionList';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || (!isAdminEmail(user.email ?? '') && !canEditSesje(user.email))) return redirect({href: '/konto', locale});

  const db = createSupabaseServiceRole();

  const SESSION_TYPES = ['natalia_solo', 'natalia_asysta', 'natalia_justyna', 'natalia_agata', 'natalia_przemek', 'natalia_para'];

  const { data: bookings } = await db
    .from('bookings')
    .select(`
      id, session_type, status, topics, live_session_id, created_at, payment_status,
      slot:booking_slots(slot_date, start_time, end_time),
      user_id,
      recordings:booking_recordings!booking_recordings_booking_id_fkey(
        id, recording_phase, status, created_at
      )
    `)
    .in('session_type', SESSION_TYPES)
    .in('status', ['confirmed', 'completed', 'pending_confirmation'])
    .order('created_at', { ascending: false })
    .limit(2000);

  // Enrich with client profiles + pick latest ready sesja recording per booking
  const userIds = [...new Set((bookings || []).map((b: any) => b.user_id).filter(Boolean))];

  const [profilesResult, importedAccessResult] = await Promise.all([
    userIds.length > 0
      ? db.from('profiles').select('id, email, display_name').in('id', userIds)
      : Promise.resolve({ data: [] }),
    // Fetch imported recordings (no booking_id FK) via access table, matched by user_id + session_date
    userIds.length > 0
      ? db
          .from('booking_recording_access')
          .select('user_id, recording_id, revoked_at, recording:booking_recordings!inner(id, session_date, status, source)')
          .in('user_id', userIds)
          .is('revoked_at', null)
          .eq('recording.status', 'ready')
          .eq('recording.source', 'import')
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profilesResult.data || []).map((p: any) => [p.id, p]));

  // Build map: `${userId}__${sessionDate}` → recording_id (latest wins by recording_id desc)
  const importedRecordingMap = new Map<string, string>();
  for (const row of (importedAccessResult.data || []) as any[]) {
    const rec = Array.isArray(row.recording) ? row.recording[0] : row.recording;
    if (!rec?.session_date) continue;
    const key = `${row.user_id}__${rec.session_date}`;
    if (!importedRecordingMap.has(key)) {
      importedRecordingMap.set(key, rec.id);
    }
  }

  const enriched = (bookings || []).map((booking: any) => {
    const readyRecordings = (booking.recordings || [])
      .filter((r: any) => r.recording_phase === 'sesja' && r.status === 'ready')
      .sort((r1: any, r2: any) => (r2.created_at || '').localeCompare(r1.created_at || ''));
    const liveKitRecordingId = readyRecordings[0]?.id ?? null;

    // Fall back to imported recording matched by user_id + slot_date
    const slot = Array.isArray(booking.slot) ? booking.slot[0] : booking.slot;
    const importedRecordingId = liveKitRecordingId
      ? null
      : (importedRecordingMap.get(`${booking.user_id}__${slot?.slot_date}`) ?? null);

    return {
      ...booking,
      client: profileMap.get(booking.user_id) || null,
      readySesjaRecordingId: liveKitRecordingId ?? importedRecordingId,
    };
  });

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Sesje klientów</h2>
        <p className="text-sm text-htg-fg-muted">Wszystkie sesje indywidualne — {enriched.length} łącznie</p>
      </div>

      <AdminSessionList
        bookings={enriched}
        todayStr={todayStr}
        locale={locale}
        adminUserEmail={user.email ?? ''}
        adminUserId={user.id}
      />
    </div>
  );
}
