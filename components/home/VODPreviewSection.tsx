import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n-config';
import { Play } from 'lucide-react';
import { getHomePageSessions } from '@/lib/services/homepage-sessions';

const BUNNY_LOOP_URL =
  'https://htg2-cdn.b-cdn.net/HTG%20CYOU%20-%20Loop%20Canvas%200-3M.mp4';

export default async function VODPreviewSection() {
  const locale = await getLocale();
  const [t, sessions] = await Promise.all([
    getTranslations({ locale, namespace: 'Home' }),
    getHomePageSessions(locale),
  ]);

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            {t('vod_title')}
          </h2>
          <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
            {t('vod_subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sessions.length > 0
            ? sessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
                >
                  <Link href="/sesje" className="relative block aspect-video overflow-hidden">
                    <video
                      src={BUNNY_LOOP_URL}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-black/35 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  </Link>
                  <div className="p-5">
                    <h3 className="font-serif font-semibold text-lg text-htg-fg mb-2 leading-snug line-clamp-2">
                      {session.title}
                    </h3>
                    {session.description && (
                      <p className="text-htg-fg-muted text-sm mb-4 line-clamp-2 leading-relaxed">
                        {session.description}
                      </p>
                    )}
                    <Link href="/sesje" className="text-htg-sage font-medium text-sm hover:underline">
                      Odsłuchaj →
                    </Link>
                  </div>
                </div>
              ))
            : [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden"
                >
                  <div className="aspect-video bg-htg-surface flex items-center justify-center">
                    <Play className="w-10 h-10 text-htg-fg-muted/30" />
                  </div>
                  <div className="p-5 space-y-2">
                    <div className="h-5 bg-htg-surface rounded w-3/4" />
                    <div className="h-4 bg-htg-surface rounded w-full" />
                    <div className="h-4 bg-htg-surface rounded w-2/3" />
                  </div>
                </div>
              ))}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/sesje"
            className="inline-block border border-htg-card-border text-htg-fg px-6 py-3 rounded-xl text-sm font-medium hover:bg-htg-surface transition-colors"
          >
            {t('hero_cta')}
          </Link>
        </div>
      </div>
    </section>
  );
}
