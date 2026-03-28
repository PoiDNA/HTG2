import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import type { Metadata } from 'next';
import HeroSection from '@/components/hero/HeroSection';
import VODPreviewSection from '@/components/home/VODPreviewSection';
import SubscriptionCTASection from '@/components/home/SubscriptionCTASection';
import YouTubeSection from '@/components/home/YouTubeSection';
import TeamSection from '@/components/home/TeamSection';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import HelpContactSection from '@/components/home/HelpContactSection';

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
      url: `https://htgcyou.com/${locale}`,
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <HeroSection />
      <VODPreviewSection />
      <SubscriptionCTASection />
      <YouTubeSection />
      <TeamSection />
      <TestimonialsSection />
      <HelpContactSection />
    </>
  );
}
