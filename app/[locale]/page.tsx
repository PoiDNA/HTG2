/**
 * LANDING PAGE — tryb "aktualizacja serwisu"
 *
 * Aby przywrócić pełną stronę główną, zamień zawartość tego pliku na:
 *
 *   import HeroSection from '@/components/hero/HeroSection';
 *   import VODPreviewSection from '@/components/home/VODPreviewSection';
 *   import SubscriptionCTASection from '@/components/home/SubscriptionCTASection';
 *   import YouTubeSection from '@/components/home/YouTubeSection';
 *   import TeamSection from '@/components/home/TeamSection';
 *   import TestimonialsSection from '@/components/home/TestimonialsSection';
 *   import HelpContactSection from '@/components/home/HelpContactSection';
 *
 *   export default async function HomePage(...) {
 *     return (
 *       <>
 *         <HeroSection />
 *         <VODPreviewSection />
 *         <SubscriptionCTASection />
 *         <YouTubeSection />
 *         <TeamSection />
 *         <TestimonialsSection />
 *         <HelpContactSection />
 *       </>
 *     );
 *   }
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, LogIn } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `https://htg.cyou/${locale}`,
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Landing' });

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <div className="mb-8">
          <span className="text-5xl font-serif font-bold text-htg-fg tracking-tight">HTG</span>
        </div>

        {/* Status */}
        <div className="inline-flex items-center gap-2 bg-htg-sage/10 text-htg-sage px-4 py-2 rounded-full text-sm font-medium mb-6">
          <span className="w-2 h-2 bg-htg-sage rounded-full animate-pulse" />
          {t('status')}
        </div>

        {/* Heading */}
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-htg-fg mb-4">
          {t('title')}
        </h1>

        {/* Description */}
        <p className="text-htg-fg-muted text-base md:text-lg leading-relaxed mb-10">
          {t('description')}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="https://htgcyou.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-htg-sage text-white px-8 py-3.5 rounded-xl font-medium text-base hover:bg-htg-sage-dark transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            {t('enter_service')}
          </a>

          <Link
            href={`/${locale}/login`}
            className="inline-flex items-center justify-center gap-2 bg-htg-surface text-htg-fg border border-htg-card-border px-8 py-3.5 rounded-xl font-medium text-base hover:bg-htg-card transition-colors"
          >
            <LogIn className="w-5 h-5" />
            {t('login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
