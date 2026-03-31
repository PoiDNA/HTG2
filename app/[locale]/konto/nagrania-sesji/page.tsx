import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import { Headphones, Clock, Info } from 'lucide-react';
import { Link } from '@/i18n-config';
import RevokeButton from './RevokeButton';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SessionRecordingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId } = await getEffectiveUser();
  const db = createSupabaseServiceRole();

  // Fetch recordings with access
  const { data: recordings } = await db
    .from('booking_recording_access')
    .select(`
      granted_at,
      revoked_at,
      recording:booking_recordings(
        id, title, session_type, session_date, status, duration_seconds,
        expires_at, legal_hold, booking_id, recording_started_at, metadata
      )
    `)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false });

  // Flatten and filter
  const items = (recordings ?? [])
    .map((r) => r.recording as Record<string, unknown>)
    .filter(Boolean)
    .filter((r) => ['queued', 'preparing', 'uploading', 'processing', 'ready'].includes(r.status as string));

  // Group by booking_id
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const key = (item.booking_id as string) ?? item.id as string;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  // Sort groups by session_date desc
  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const dateA = a[1][0]?.session_date as string ?? '';
    const dateB = b[1][0]?.session_date as string ?? '';
    return dateB.localeCompare(dateA);
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Headphones className="w-6 h-6 text-htg-sage" />
        <h1 className="text-2xl font-serif font-bold text-htg-fg">Nagrania z sesji</h1>
      </div>

      {/* Privacy banner */}
      <div className="bg-htg-surface rounded-xl p-4 mb-6 flex items-start gap-3 border border-htg-card-border">
        <Info className="w-5 h-5 text-htg-fg-muted shrink-0 mt-0.5" />
        <p className="text-sm text-htg-fg-muted">
          Nagrania z Twoich sesji są dostępne przez okres do 12 miesięcy od daty sesji.
          Ze względów bezpieczeństwa zastrzegamy sobie prawo do skrócenia tego czasu.
          Jeśli chcesz usunąć nagranie lub zgłosić problem, napisz do nas na{' '}
          <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
        </p>
      </div>

      {sortedGroups.length === 0 ? (
        <div className="text-center py-16">
          <Headphones className="w-12 h-12 text-htg-fg-muted/30 mx-auto mb-4" />
          <p className="text-htg-fg-muted">Nie masz jeszcze żadnych nagrań z sesji.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([bookingId, recs]) => {
            const main = recs.reduce((longest, r) =>
              ((r.duration_seconds as number) ?? 0) > ((longest.duration_seconds as number) ?? 0) ? r : longest
            , recs[0]);
            const sessionType = main.session_type as SessionType;
            const config = SESSION_CONFIG[sessionType];
            const isPara = sessionType === 'natalia_para';
            const isReady = main.status === 'ready';
            const isLegalHold = main.legal_hold === true;
            const expiresAt = main.expires_at as string | null;

            return (
              <div key={bookingId} className="bg-htg-card border border-htg-card-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white ${config?.color ?? 'bg-gray-500'}`}>
                        {config?.labelShort ?? sessionType}
                      </span>
                      {isPara && (
                        <span className="text-xs text-htg-fg-muted">
                          dostępne również dla partnera/ki
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-htg-fg truncate">
                      {main.title as string ?? `Sesja — ${main.session_date}`}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-htg-fg-muted">
                      {main.session_date && (
                        <span>{new Date(main.session_date as string).toLocaleDateString('pl-PL')}</span>
                      )}
                      {main.duration_seconds && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {Math.floor((main.duration_seconds as number) / 60)} min
                        </span>
                      )}
                      {expiresAt && isReady && !isLegalHold && (
                        <span className="text-xs">
                          Dostępne do {new Date(expiresAt).toLocaleDateString('pl-PL')}
                        </span>
                      )}
                    </div>

                    {/* Partial recording notice */}
                    {main.recording_started_at && main.session_date && isReady && (
                      <p className="text-xs text-amber-500/80 mt-1">
                        Nagranie od {new Date(main.recording_started_at as string).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}

                    {/* Legal hold — client-friendly, no mention of "blokada prawna" */}
                    {isLegalHold && isReady && (
                      <p className="text-xs text-htg-fg-muted mt-1">
                        To nagranie zostało zarchiwizowane.{' '}
                        <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">
                          Skontaktuj się z nami
                        </a>
                        , jeśli masz pytania.
                      </p>
                    )}

                    {/* Multiple parts */}
                    {recs.length > 1 && (
                      <div className="mt-2 space-y-1">
                        {recs.map((r, i) => (
                          <div key={r.id as string} className="text-xs text-htg-fg-muted">
                            Część {i + 1}{r.duration_seconds ? ` (${Math.floor((r.duration_seconds as number) / 60)} min)` : ''}
                            {(r.status as string) === 'ready' && (
                              <Link href={`/konto/nagrania-sesji/${r.id}`} className="ml-2 text-htg-sage hover:underline">
                                Odsłuchaj
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {isReady ? (
                      recs.length === 1 ? (
                        <Link
                          href={`/konto/nagrania-sesji/${main.id}`}
                          className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage/90 transition-colors"
                        >
                          Odsłuchaj
                        </Link>
                      ) : null
                    ) : (
                      <div className="flex items-center gap-2 text-htg-fg-muted text-sm">
                        <div className="w-4 h-4 border-2 border-htg-fg-muted/30 border-t-htg-sage rounded-full animate-spin" />
                        <span>Przygotowywane...</span>
                      </div>
                    )}
                    {isReady && !isLegalHold && (
                      <RevokeButton recordingId={main.id as string} isPara={isPara} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
