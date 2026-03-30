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
import { ExternalLink } from 'lucide-react';

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
    <div className="fixed inset-0 z-[60] bg-htg-bg flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm mx-auto">
        {/* Logo */}
        <div className="mb-6">
          <span className="text-5xl font-serif font-bold text-htg-fg tracking-tight">HTG</span>
        </div>

        {/* Status */}
        <div className="inline-flex items-center gap-2 bg-htg-sage/10 text-htg-sage px-4 py-2 rounded-full text-sm font-medium mb-10">
          <span className="w-2 h-2 bg-htg-sage rounded-full animate-pulse" />
          {t('status')}
        </div>

        {/* Single CTA */}
        <div>
          <a
            href="https://htgcyou.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-htg-sage text-white px-8 py-3.5 rounded-xl font-medium text-base hover:bg-htg-sage-dark transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            {t('enter_service')}
          </a>
        </div>
      </div>
    </div>
  );
}
