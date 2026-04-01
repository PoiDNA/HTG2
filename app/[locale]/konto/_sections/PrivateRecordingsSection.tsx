import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import { Headphones, Clock } from 'lucide-react';
import { Link } from '@/i18n-config';
import RevokeButton from '../nagrania-sesji/RevokeButton';

/**
 * Private session recordings section for /konto dashboard.
 * Shows last 5 recordings + "Show all" link.
 * Wrapped in <Suspense> by parent — streams independently.
 */
export default async function PrivateRecordingsSection({ locale }: { locale: string }) {
  const { userId } = await getEffectiveUser();
  const db = createSupabaseServiceRole();

  const { data: recordings } = await db
    .from('booking_recording_access')
    .select(`
      granted_at,
      recording:booking_recordings(
        id, title, session_type, session_date, status, duration_seconds,
        expires_at, legal_hold, booking_id, recording_started_at
      )
    `)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })
    .limit(6); // fetch 6 to know if "show all" is needed

  const items = (recordings ?? [])
    .map((r) => {
      const rec = r.recording;
      return (Array.isArray(rec) ? rec[0] : rec) as Record<string, unknown> | null;
    })
    .filter(Boolean)
    .filter((r) => ['queued', 'preparing', 'uploading', 'processing', 'ready'].includes(r!.status as string)) as Record<string, unknown>[];

  const hasMore = items.length > 5;
  const displayItems = items.slice(0, 5);

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Headphones className="w-5 h-5 text-htg-sage" />
          <h2 className="text-lg font-serif font-semibold text-htg-fg">Nagrania z Twoich sesji</h2>
        </div>
        {items.length > 0 && (
          <Link
            href="/konto/nagrania-sesji"
            className="text-sm text-htg-sage hover:underline"
          >
            Pokaż wszystkie &rarr;
          </Link>
        )}
      </div>

      {displayItems.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
          <Headphones className="w-10 h-10 text-htg-fg-muted/30 mx-auto mb-3" />
          <p className="text-sm text-htg-fg-muted">
            Nagrania z Twoich sesji pojawią się tutaj po pierwszej sesji z nagraniem.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayItems.map((item) => {
            const sessionType = item.session_type as SessionType;
            const config = SESSION_CONFIG[sessionType];
            const isPara = sessionType === 'natalia_para';
            const isReady = item.status === 'ready';
            const isLegalHold = item.legal_hold === true;

            return (
              <div key={item.id as string} className="bg-htg-card border border-htg-card-border rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white ${config?.color ?? 'bg-gray-500'}`}>
                        {config?.labelShort ?? sessionType}
                      </span>
                      {isPara && (
                        <span className="text-xs text-htg-fg-muted">z partnerem/ką</span>
                      )}
                    </div>
                    <h3 className="font-medium text-htg-fg text-sm truncate">
                      {item.title as string ?? `Sesja — ${item.session_date}`}
                    </h3>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-htg-fg-muted">
                      {item.session_date && (
                        <span>{new Date(item.session_date as string).toLocaleDateString('pl-PL')}</span>
                      )}
                      {item.duration_seconds && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {Math.floor((item.duration_seconds as number) / 60)} min
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isReady ? (
                      <Link
                        href={`/konto/nagrania-sesji/${item.id}`}
                        className="bg-htg-sage text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-htg-sage/90 transition-colors"
                      >
                        Odsłuchaj
                      </Link>
                    ) : (
                      <div className="flex items-center gap-1.5 text-htg-fg-muted text-xs">
                        <div className="w-3 h-3 border-2 border-htg-fg-muted/30 border-t-htg-sage rounded-full animate-spin" />
                        <span>Przetwarzane...</span>
                      </div>
                    )}
                    {isReady && !isLegalHold && (
                      <RevokeButton recordingId={item.id as string} isPara={isPara} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <Link
              href="/konto/nagrania-sesji"
              className="block text-center text-sm text-htg-sage hover:underline py-2"
            >
              Pokaż wszystkie nagrania &rarr;
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
