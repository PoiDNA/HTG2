import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';

export default function Footer() {
  const t = useTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-htg-indigo text-white/80 mt-auto relative overflow-hidden">
      {/* Background logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <Image
          src="https://htg2-cdn.b-cdn.net/images/logo-512.png"
          alt=""
          width={512}
          height={512}
          className="w-64 h-64 md:w-80 md:h-80 object-contain opacity-[0.06]"
          unoptimized
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-4 md:py-10">
        {/* Brand */}
        <div className="mb-3 md:mb-6">
          <span className="text-base font-serif font-bold text-white">HTG</span>
          <span className="text-sm text-white/60"> — {t('tagline')}</span>
        </div>

        {/* Links — vertical column */}
        <div className="flex flex-col items-start gap-2 text-sm">
          <Link href="/privacy" className="whitespace-nowrap hover:text-white transition-colors">
            {t('privacy')}
          </Link>
          <Link href="/terms" className="whitespace-nowrap hover:text-white transition-colors">
            {t('terms')}
          </Link>
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
