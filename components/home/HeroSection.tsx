import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';

export default function HeroSection() {
  const t = useTranslations('Home');

  return (
    <section className="bg-htg-indigo text-white py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold mb-6 leading-tight">
          {t('hero_title')}
        </h1>
        <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10">
          {t('hero_subtitle')}
        </p>
        <Link
          href="/sesje"
          className="inline-block bg-htg-sage text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-htg-sage-dark transition-colors shadow-lg"
        >
          {t('hero_cta')}
        </Link>
      </div>
    </section>
  );
}
