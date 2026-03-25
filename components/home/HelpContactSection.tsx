import { useTranslations } from 'next-intl';
import { Phone, Mail } from 'lucide-react';

export default function HelpContactSection() {
  const t = useTranslations('Home');

  return (
    <section className="py-16 md:py-24 bg-htg-indigo text-white">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">
          {t('help_title')}
        </h2>
        <p className="text-white/70 text-lg mb-10 max-w-xl mx-auto">
          {t('help_subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
          <a
            href="tel:+48000000000"
            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 px-6 py-4 rounded-xl transition-colors"
          >
            <Phone className="w-6 h-6" />
            <div className="text-left">
              <p className="text-sm text-white/60">{t('help_phone')}</p>
              <p className="font-semibold text-lg">+48 000 000 000</p>
            </div>
          </a>

          <a
            href="mailto:sesje@htg.cyou"
            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 px-6 py-4 rounded-xl transition-colors"
          >
            <Mail className="w-6 h-6" />
            <div className="text-left">
              <p className="text-sm text-white/60">{t('help_email')}</p>
              <p className="font-semibold text-lg">sesje@htg.cyou</p>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}
