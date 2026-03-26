import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { PublicationStatusBadge } from '@/components/publikacja/PublicationStatusBadge';
import { SessionDetailClient } from './SessionDetailClient';
import type { PublicationStatus } from '@/lib/publication/types';

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Publikacja' });
  const tDaw = await getTranslations({ locale, namespace: 'Daw' });
  const tAe = await getTranslations({ locale, namespace: 'AutoEdit' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

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
    .select(`
      *,
      monthly_set:monthly_sets(id, title, month),
      assigned_editor:profiles!session_publications_assigned_editor_id_fkey(id, email, display_name)
    `)
    .eq('id', id)
    .single();

  if (!session) {
    notFound();
  }

  // Access check
  if (!isAdmin && session.assigned_editor_id && session.assigned_editor_id !== user.id) {
    redirect(`/${locale}/publikacja/sesje`);
  }

  const statusLabels: Record<string, string> = {
    raw: t('status_raw'),
    editing: t('status_editing'),
    edited: t('status_edited'),
    mastering: t('status_mastering'),
    published: t('status_published'),
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-htg-fg">
            {session.id.slice(0, 8)}
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <PublicationStatusBadge
              status={session.status as PublicationStatus}
              labels={statusLabels}
            />
            {session.monthly_set && (
              <span className="text-sm text-htg-fg-muted">
                {session.monthly_set.title}
              </span>
            )}
            <span className="text-sm text-htg-fg-muted">
              {new Date(session.created_at).toLocaleDateString(locale)}
            </span>
          </div>
          {session.assigned_editor && (
            <p className="text-sm text-htg-fg-muted mt-1">
              {t('assigned_to')}: {session.assigned_editor.display_name || session.assigned_editor.email}
            </p>
          )}
        </div>
      </div>

      {/* Interactive client part */}
      <SessionDetailClient
        session={JSON.parse(JSON.stringify(session))}
        isAdmin={isAdmin}
        userId={user.id}
        labels={{
          source_tracks: t('source_tracks'),
          edited_tracks: t('edited_tracks'),
          upload_edited: t('upload_edited'),
          editor_notes: t('editor_notes'),
          admin_notes: t('admin_notes'),
          notes_placeholder: t('notes_placeholder'),
          save_notes: t('save_notes'),
          download: t('download'),
          no_tracks: t('no_tracks'),
          drag_drop: t('drag_drop'),
          or_click: t('or_click'),
          uploading: t('uploading'),
          remove: t('remove'),
          upload: t('upload'),
          advance_to: t('advance_to'),
          reset_to: t('reset_to'),
          status_raw: t('status_raw'),
          status_editing: t('status_editing'),
          status_edited: t('status_edited'),
          status_mastering: t('status_mastering'),
          status_published: t('status_published'),
          workflow: t('workflow'),
          open_editor: tDaw('open_editor'),
          auto_edit_title: tAe('title'),
          auto_edit_start: tAe('start_pipeline'),
          auto_edit_starting: tAe('starting'),
          auto_edit_resume: tAe('resume'),
          auto_edit_no_source: tAe('no_source_tracks'),
          auto_edit_done: tAe('pipeline_done'),
          auto_edit_failed: tAe('pipeline_failed'),
          auto_edit_approve: tAe('approve'),
          auto_edit_reject: tAe('reject'),
          auto_edit_transcription: tAe('transcription'),
          auto_edit_show_transcription: tAe('show_transcription'),
          auto_edit_hide_transcription: tAe('hide_transcription'),
          auto_edit_select_stages: tAe('select_stages'),
          auto_edit_all_stages: tAe('all_stages'),
          auto_edit_stage_transcribe: tAe('stage_transcribe'),
          auto_edit_stage_analyze: tAe('stage_analyze'),
          auto_edit_stage_clean: tAe('stage_clean'),
          auto_edit_stage_mix: tAe('stage_mix'),
          auto_edit_stage_master: tAe('stage_master'),
          auto_edit_status_pending: tAe('status_pending'),
          auto_edit_status_processing: tAe('status_processing'),
          auto_edit_status_done: tAe('status_done'),
          auto_edit_status_failed: tAe('status_failed'),
          auto_edit_loading: tAe('loading'),
          auto_edit_no_transcription: tAe('no_transcription'),
          auto_edit_action_remove: tAe('action_remove'),
          auto_edit_action_shorten: tAe('action_shorten'),
          auto_edit_action_keep: tAe('action_keep'),
          auto_edit_legend: tAe('legend'),
        }}
      />
    </div>
  );
}
