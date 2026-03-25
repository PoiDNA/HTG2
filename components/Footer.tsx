import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';

export default function Footer() {
  const t = useTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-htg-indigo text-white/80 mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="text-lg font-serif font-bold text-white mb-2">HTG</h3>
            <p className="text-sm text-white/60">{t('tagline')}</p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-2">
            <Link href="/privacy" className="text-sm hover:text-white transition-colors">
              {t('privacy')}
            </Link>
            <Link href="/terms" className="text-sm hover:text-white transition-colors">
              {t('terms')}
            </Link>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-white">{t('contact')}</p>
            <a href="mailto:sesje@htg.cyou" className="text-sm hover:text-white transition-colors">
              {t('email')}
            </a>
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-6 text-center text-sm text-white/40">
          {t('copyright', { year: String(year) })}
        </div>
      </div>
    </footer>
  );
}
