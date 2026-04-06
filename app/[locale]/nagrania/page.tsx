import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { Youtube, Users } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase/server';
import VideoThumbnail from '@/components/VideoThumbnail';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Recordings' });
  return {
    title: t('title'),
    description: t('subtitle'),
    openGraph: {
      title: t('title'),
      description: t('subtitle'),
      url: `https://htgcyou.com/${locale}/nagrania`,
    },
  };
}

export default async function RecordingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Recordings' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

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
              <VideoThumbnail youtubeId={video.youtube_id} title={video.title} />
              <div className="p-4">
                <h3 className="font-serif font-semibold text-htg-fg leading-snug">{video.title}</h3>
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

      {/* Facebook group section — only for logged-in users */}
      {isLoggedIn && <div className="mt-16 border-t border-htg-card-border pt-12">
        <a
          href="https://www.facebook.com/groups/700310275054653"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col sm:flex-row items-center gap-6 bg-htg-card border border-htg-card-border rounded-2xl p-8 hover:border-htg-sage/40 transition-all duration-300 hover:shadow-lg hover:shadow-htg-sage/5"
        >
          <div className="flex-shrink-0 w-14 h-14 rounded-full bg-htg-sage/10 flex items-center justify-center group-hover:bg-htg-sage/20 transition-colors duration-300">
            <Users className="w-7 h-7 text-htg-sage" />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-xs font-medium text-htg-sage uppercase tracking-widest mb-1">Grupa na Facebooku</p>
            <h3 className="text-lg font-serif font-semibold text-htg-fg mb-1">
              Zapraszamy do aktywności w naszej grupie
            </h3>
            <p className="text-htg-fg-muted text-sm">
              Tylko dla osób po sesji — dołącz i bądź częścią społeczności.
            </p>
          </div>
          <div className="sm:ml-auto flex-shrink-0">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-htg-sage/10 text-htg-sage text-sm font-medium group-hover:bg-htg-sage group-hover:text-white transition-all duration-300">
              Dołącz do grupy
            </span>
          </div>
        </a>
      </div>}
    </div>
  );
}
