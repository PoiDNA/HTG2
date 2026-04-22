'use client';

import Image from 'next/image';
import { Link } from '@/i18n-config';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import HeroHostCrumble from './HeroHostCrumble';

export default function HeroSection() {
  const t = useTranslations('Home');
  const [taglineVisible, setTaglineVisible] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setTaglineVisible(true);
      return;
    }
    const timer = setTimeout(() => setTaglineVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative min-h-svh flex flex-col justify-center">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-14 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 py-24 lg:py-16">

        {/* ── Left column ───────────────────────────────────────── */}
        <div className="flex flex-col justify-center">

          {/* Logo + tagline */}
          <div className="flex items-center gap-3 mb-14 lg:mb-20">
            <Link href="/" aria-label="HTG — Hacking The Game">
              <Image
                src="/icon.png"
                alt="HTG"
                width={42}
                height={42}
                priority
                className="rounded-full"
              />
            </Link>
            <span
              className="flex items-baseline gap-[0.35em] transition-opacity duration-1000 ease-out"
              style={{ opacity: taglineVisible ? 1 : 0 }}
            >
              <span className="text-sm font-serif font-bold tracking-wide text-htg-fg">
                HTG
              </span>
              <span className="text-xs font-sans font-normal tracking-wider text-htg-fg-muted/70">
                — Hacking The Game
              </span>
            </span>
          </div>

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
