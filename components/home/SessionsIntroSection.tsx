import { getTranslations, getLocale } from 'next-intl/server';
import { Link } from '@/i18n-config';

export default async function SessionsIntroSection() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'Home' });

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-4xl px-6">

        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            {t('sessions_intro_title')}
          </h2>
          <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
            {t('sessions_intro_subtitle')}
          </p>
        </div>

        {/* Player container */}
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-htg-surface border border-htg-card-border shadow-lg mb-8">
          {/* TODO: wklej tu URL wideo od Natalii */}
          <div className="absolute inset-0 flex items-center justify-center text-htg-fg-muted/40 text-sm">
            [player]
          </div>
        </div>

        {/* Short description */}
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <p className="text-htg-fg-muted leading-relaxed">
            {t('sessions_intro_desc')}
          </p>
          <Link
            href="/sesje"
            className="inline-block bg-htg-indigo text-white px-6 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t('hero_cta')}
          </Link>
        </div>

      </div>
    </section>
  );
}
