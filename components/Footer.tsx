import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';

export default function Footer() {
  const t = useTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-htg-indigo text-white/80 mt-auto relative overflow-hidden">
      {/* Background logo — 1/5 of footer height, no transparency */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <Image
          src="https://htg2-cdn.b-cdn.net/images/logo-512.png"
          alt=""
          width={512}
          height={512}
          className="h-[20%] w-auto object-contain"
          unoptimized
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-3 md:py-6">
        {/* Top row: brand left, links right */}
        <div className="flex items-start justify-between gap-4">
          {/* Brand + email */}
          <div>
            <div>
              <span className="text-base font-serif font-bold text-white">HTG</span>
              <span className="text-sm text-white/60"> — {t('tagline')}</span>
            </div>
            <div className="mt-1">
              <a href="mailto:sesje@htg.cyou" className="text-xs text-white/50 hover:text-white transition-colors">
                {t('email')}
              </a>
            </div>
          </div>

          {/* Links — right side, vertical */}
          <div className="flex flex-col items-end gap-1 text-sm">
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
        </div>

        <div className="border-t border-white/10 mt-3 pt-3 text-center text-xs text-white/40">
          {t('copyright', { year: String(year) })}
        </div>
      </div>
    </footer>
  );
}
