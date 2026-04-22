'use client';

import { Link } from '@/i18n-config';
import { useTranslations } from 'next-intl';
import HeroHostCrumble from './HeroHostCrumble';

export default function HeroSection() {
  const t = useTranslations('Home');

  return (
    <section className="relative min-h-svh flex flex-col justify-center">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-14 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 py-24 lg:py-16">

        {/* ── Left column ───────────────────────────────────────── */}
        <div className="flex flex-col justify-center">

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-[3.2rem] xl:text-6xl font-serif font-bold leading-[1.12] text-htg-fg mb-6">
            {t('hero_title')}
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-htg-fg-muted max-w-[30rem] mb-10 leading-relaxed">
            {t('hero_subtitle')}
          </p>

          {/* CTA */}
          <div>
            <Link
              href="/sesje"
              className="inline-block bg-htg-indigo text-white px-8 py-4 rounded-2xl text-base font-semibold shadow-lg hover:opacity-90 active:scale-[0.98] transition-all duration-150"
            >
              {t('hero_cta')}
            </Link>
          </div>
        </div>

        {/* ── Right column: animation ────────────────────────────── */}
        <div className="relative hidden lg:block" style={{ minHeight: '520px' }}>
          <HeroHostCrumble />
        </div>

      </div>
    </section>
  );
}
