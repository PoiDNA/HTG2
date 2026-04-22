import { getTranslations, getLocale } from 'next-intl/server';
import { getLatestYoutubeVideos } from '@/lib/services/latest-youtube-video';
import VideoThumbnail from '@/components/VideoThumbnail';

export default async function YouTubeSection() {
  const locale = await getLocale();
  const [t, videos] = await Promise.all([
    getTranslations({ locale, namespace: 'Home' }),
    getLatestYoutubeVideos(locale, 3),
  ]);

  if (videos.length === 0) return null;

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
            <div
              key={video.youtube_id}
              className="rounded-xl overflow-hidden bg-htg-card border border-htg-card-border"
            >
              <VideoThumbnail youtubeId={video.youtube_id} title={video.title} />
              <div className="p-4">
                <h3 className="font-serif font-semibold text-htg-fg leading-snug line-clamp-2">
                  {video.title}
                </h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
