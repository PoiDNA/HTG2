import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { DawEditor } from '@/components/daw/DawEditor';
import type { TrackInfo } from '@/lib/publication/types';
import { Link } from '@/i18n-config';
import { ArrowLeft } from 'lucide-react';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Daw' });
  const tPub = await getTranslations({ locale, namespace: 'Publikacja' });

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'moderator';

  const { data: session } = await supabase
    .from('session_publications')
    .select(
      `
      *,
      monthly_set:monthly_sets(id, title, month)
    `
    )
    .eq('id', id)
    .single();

  if (!session) {
    notFound();
  }

  // Access check
  if (!isAdmin && session.assigned_editor_id && session.assigned_editor_id !== user.id) {
    redirect(`/${locale}/publikacja/sesje`);
  }

  const sourceTracks = (session.source_tracks || []) as TrackInfo[];

  return (
    <div className="space-y-4">
      {/* Back link + title */}
      <div className="flex items-center gap-3">
        <Link
          href={`/publikacja/sesje/${id}`}
          className="flex items-center gap-1 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {tPub('view')}
        </Link>
        <h2 className="text-lg font-serif font-bold text-htg-fg">
          {t('title')}
        </h2>
        {session.monthly_set && (
          <span className="text-sm text-htg-fg-muted">
            — {session.monthly_set.title}
          </span>
        )}
      </div>

      {/* DAW Editor */}
      {sourceTracks.length > 0 ? (
        <DawEditor
          publicationId={id}
          tracks={sourceTracks}
          labels={{
            loading: t('loading'),
            loading_track: t('loading_track'),
            play: t('play'),
            pause: t('pause'),
            stop: t('stop'),
            rewind: t('rewind'),
            zoom_in: t('zoom_in'),
            zoom_out: t('zoom_out'),
            select: t('select'),
            cut: t('cut'),
            delete: t('delete'),
            trim: t('trim'),
            fade_in: t('fade_in'),
            fade_out: t('fade_out'),
            undo: t('undo'),
            redo: t('redo'),
            save: t('save'),
            export_mix: t('export_mix'),
            export_tracks: t('export_tracks'),
            saving: t('saving'),
            solo: t('solo'),
            mute: t('mute'),
            master_volume: t('master_volume'),
            save_success: t('save_success'),
            save_error: t('save_error'),
            export_progress: t('export_progress'),
          }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-xl p-12"
          style={{ backgroundColor: '#120f1e' }}
        >
          <p className="text-sm text-htg-fg-muted">{t('no_tracks')}</p>
        </div>
      )}
    </div>
  );
}
