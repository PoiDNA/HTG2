import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Recordings' });
  return { title: t('title') };
}

export default async function RecordingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Recordings' });

  // TODO: Fetch from Supabase htg.youtube_videos
  const videos = [
    { id: 'dQw4w9WgXcQ', title: 'Wprowadzenie do HTG', description: 'Czym są sesje rozwoju duchowego i jak wyglądają.' },
    { id: 'dQw4w9WgXcQ', title: 'Sesja otwarta — fragment', description: 'Fragment sesji grupowej dostępnej publicznie.' },
    { id: 'dQw4w9WgXcQ', title: 'Q&A z Natalią', description: 'Odpowiedzi na najczęściej zadawane pytania.' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
          {t('title')}
        </h1>
        <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((video, i) => (
          <div key={i} className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${video.id}`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
                loading="lazy"
              />
            </div>
            <div className="p-5">
              <h3 className="font-serif font-semibold text-lg text-htg-fg mb-2">{video.title}</h3>
              <p className="text-htg-fg-muted text-sm">{video.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
