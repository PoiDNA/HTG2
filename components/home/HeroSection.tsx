'use client';

import { Link } from '@/i18n-config';
import { useTranslations } from 'next-intl';
import HeroHostCrumble from './HeroHostCrumble';

export default function HeroSection() {
  const t = useTranslations('Home');

  return (
    <section className="relative min-h-svh flex flex-col justify-center overflow-visible">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-14 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 py-24 lg:py-16">

        {/* ── Left column — z-10 so text sits above overflowing particles ── */}
        <div className="relative z-10 flex flex-col justify-center">

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-[3.2rem] xl:text-6xl font-serif font-bold leading-[1.12] text-htg-fg mb-6">
            {t('hero_title')}
          </h1>

          {/* CTA — login */}
          <div className="flex flex-col items-start gap-3">
            <Link
              href="/login"
              className="inline-block bg-htg-indigo text-white px-8 py-4 rounded-2xl text-base font-semibold shadow-lg hover:opacity-90 active:scale-[0.98] transition-all duration-150"
            >
              Otwórz przestrzeń
            </Link>
            <Link
              href="/login"
              className="text-xs tracking-[0.22em] uppercase text-htg-fg-muted/60 hover:text-htg-fg-muted transition-colors"
            >
              logowanie
            </Link>
          </div>
        </div>

        {/* ── Right column: animation — canvas bleeds left/top/bottom ── */}
        <div className="relative hidden lg:block" style={{ minHeight: '520px' }}>
          <HeroHostCrumble />
        </div>

      </div>
    </section>
  );
}
