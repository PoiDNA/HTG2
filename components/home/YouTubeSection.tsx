import { useTranslations } from 'next-intl';

export default function YouTubeSection() {
  const t = useTranslations('Home');

  // Placeholder YouTube IDs — will be replaced with Supabase data
  const videos = [
    { id: 'placeholder1', title: 'Wprowadzenie do HTG' },
    { id: 'placeholder2', title: 'Sesja otwarta' },
    { id: 'placeholder3', title: 'Pytania i odpowiedzi' },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            {t('youtube_title')}
          </h2>
          <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
            {t('youtube_subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {videos.map((video) => (
            <div key={video.id} className="rounded-xl overflow-hidden bg-htg-card border border-htg-card-border">
              <div className="aspect-video bg-htg-surface flex items-center justify-center text-htg-fg-muted text-sm">
                {/* Replace with: <iframe src={`https://www.youtube.com/embed/${video.id}`} ... /> */}
                YouTube: {video.title}
              </div>
              <div className="p-4">
                <h3 className="font-medium text-htg-fg">{video.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
