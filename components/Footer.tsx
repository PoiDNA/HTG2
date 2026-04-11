import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';
import StaffFooterLinks from './StaffFooterLinks';

export default function Footer() {
  const t = useTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-htg-indigo text-white/80 mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-3 md:py-4">
        {/* Top row: brand left, links right (desktop) / stacked (mobile) */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-x-6">
          {/* Brand */}
          <span className="text-base font-serif font-bold text-white">HTG</span>

          {/* Links — column on mobile, row on desktop */}
          <div className="flex flex-col gap-1.5 text-sm md:flex-row md:items-center md:gap-3">
            <Link href="/privacy" className="hover:text-white transition-colors">
              {t('privacy')}
            </Link>
            <span className="hidden md:inline text-white/30" aria-hidden="true">·</span>
            <Link href="/terms" className="hover:text-white transition-colors">
              {t('terms')}
            </Link>
            <span className="hidden md:inline text-white/30" aria-hidden="true">·</span>
            <Link href="/konto/wiadomosci" className="hover:text-white transition-colors">
              {t('contact_center')}
            </Link>
            <StaffFooterLinks />
          </div>
        </div>

        <div className="border-t border-white/10 mt-2 pt-2 text-center text-xs text-white/40">
          <a href="mailto:sesje@htg.cyou" className="hover:text-white transition-colors">
            {t('email')}
          </a>
          <span className="mx-2">·</span>
          {t('copyright', { year: String(year) })}
        </div>
      </div>
    </footer>
  );
}
