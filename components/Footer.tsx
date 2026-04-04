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

        {/* Links */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href="/privacy" className="whitespace-nowrap hover:text-white transition-colors">
            {t('privacy')}
          </Link>
          <span className="text-white/30" aria-hidden="true">·</span>
          <Link href="/terms" className="whitespace-nowrap hover:text-white transition-colors">
            {t('terms')}
          </Link>
          <span className="text-white/30" aria-hidden="true">·</span>
          <Link href="/konto/wiadomosci" className="whitespace-nowrap hover:text-white transition-colors">
            {t('contact_center')}
          </Link>
        </div>

        {/* Email fallback */}
        <div className="mt-2">
          <a href="mailto:sesje@htg.cyou" className="text-xs text-white/50 hover:text-white transition-colors">
            {t('email')}
          </a>
        </div>

        <div className="border-t border-white/10 mt-3 pt-3 md:mt-8 md:pt-6 text-center text-xs text-white/40">
          {t('copyright', { year: String(year) })}
        </div>
      </div>
    </footer>
  );
}
