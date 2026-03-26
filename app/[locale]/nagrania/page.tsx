import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { Youtube } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

  const supabase = await createSupabaseServer();
  const { data: videos } = await supabase
    .from('youtube_videos')
    .select('id, youtube_id, title, description')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true });

  const videoList = videos || [];

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

      {videoList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videoList.map((video: any) => (
            <div key={video.id} className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
              <div className="aspect-video">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}?modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                  loading="lazy"
                />
              </div>
              <div className="p-5">
                <h3 className="font-serif font-semibold text-lg text-htg-fg mb-2">{video.title}</h3>
                {video.description && (
                  <p className="text-htg-fg-muted text-sm">{video.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <Youtube className="w-16 h-16 text-htg-fg-muted mx-auto mb-4" />
          <h2 className="text-xl font-serif text-htg-fg mb-2">Wkrótce nowe nagrania</h2>
          <p className="text-htg-fg-muted">Pracujemy nad udostępnieniem materiałów publicznych.</p>
        </div>
      )}
    </div>
  );
}
