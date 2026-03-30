import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';

export default function Footer() {
  const t = useTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-htg-indigo text-white/80 mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-4 md:py-10">
        {/* Brand */}
        <div className="mb-3 md:mb-6">
          <span className="text-base font-serif font-bold text-white">HTG</span>
          <span className="text-sm text-white/60"> — {t('tagline')}</span>
        </div>

        {/* Links + Contact in two columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
          <div className="flex flex-col gap-1.5">
            <Link href="/privacy" className="text-sm hover:text-white transition-colors">
              {t('privacy')}
            </Link>
            <Link href="/terms" className="text-sm hover:text-white transition-colors">
              {t('terms')}
            </Link>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-white">{t('contact')}</p>
            <a href="mailto:sesje@htg.cyou" className="text-sm hover:text-white transition-colors">
              {t('email')}
            </a>
          </div>
        </div>

        <div className="border-t border-white/10 mt-3 pt-3 md:mt-8 md:pt-6 text-center text-xs text-white/40">
          {t('copyright', { year: String(year) })}
        </div>
      </div>
    </footer>
  );
}
