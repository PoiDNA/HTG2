import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';
import { Play } from 'lucide-react';

export default function VODPreviewSection() {
  const t = useTranslations('Home');

  // Placeholder — will be replaced with Supabase data
  const placeholderSessions = [
    { id: '1', title: 'Sesja wprowadzająca', description: 'Pierwsze kroki na drodze rozwoju duchowego.' },
    { id: '2', title: 'Medytacja uważności', description: 'Techniki medytacji i pracy z oddechem.' },
    { id: '3', title: 'Praca z emocjami', description: 'Jak rozpoznawać i przetwarzać emocje.' },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            {t('vod_title')}
          </h2>
          <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
            {t('vod_subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {placeholderSessions.map((session) => (
            <div
              key={session.id}
              className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="aspect-video bg-htg-surface flex items-center justify-center">
                <Play className="w-12 h-12 text-htg-fg-muted" />
              </div>
              <div className="p-5">
                <h3 className="font-serif font-semibold text-lg text-htg-fg mb-2">
                  {session.title}
                </h3>
                <p className="text-htg-fg-muted text-sm mb-4">
                  {session.description}
                </p>
                <Link
                  href="/sesje"
                  className="text-htg-sage font-medium text-sm hover:underline"
                >
                  {t('vod_subtitle').split('.')[0]} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
