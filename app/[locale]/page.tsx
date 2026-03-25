import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import HeroSection from '@/components/home/HeroSection';
import VODPreviewSection from '@/components/home/VODPreviewSection';
import SubscriptionCTASection from '@/components/home/SubscriptionCTASection';
import YouTubeSection from '@/components/home/YouTubeSection';
import TeamSection from '@/components/home/TeamSection';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import HelpContactSection from '@/components/home/HelpContactSection';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
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
