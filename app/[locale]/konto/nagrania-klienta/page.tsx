import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/roles';
import RecordingsPair from '@/components/live/RecordingsPair';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import { Video } from 'lucide-react';

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

  // Fetch recordings
  let recordings: any[] = [];
  if (staff) {
    // Staff see all recordings
    const { data } = await admin
      .from('client_recordings')
      .select('*, booking:bookings(session_type, slot:booking_slots(slot_date, start_time))')
      .order('created_at', { ascending: false })
      .limit(100);
    recordings = data || [];
  } else {
    // User sees own recordings (or impersonated user's recordings)
    const { data } = await admin
      .from('client_recordings')
      .select('*, booking:bookings(session_type, slot:booking_slots(slot_date, start_time))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    recordings = data || [];
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
              <RecordingsPair before={before} after={after} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
