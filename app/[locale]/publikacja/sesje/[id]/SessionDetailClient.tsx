'use client';

import { useState, useCallback } from 'react';
import { TrackList } from '@/components/publikacja/TrackList';
import { TrackUploader } from '@/components/publikacja/TrackUploader';
import { StatusWorkflow } from '@/components/publikacja/StatusWorkflow';
import { AutoEditPanel } from '@/components/publikacja/AutoEditPanel';
import type { SessionPublication, PublicationStatus, TrackInfo } from '@/lib/publication/types';
import { Link } from '@/i18n-config';
import { Headphones } from 'lucide-react';

interface SessionDetailClientProps {
  session: SessionPublication;
  isAdmin: boolean;
  userId: string;
  labels: {
    source_tracks: string;
    edited_tracks: string;
    upload_edited: string;
    editor_notes: string;
    admin_notes: string;
    notes_placeholder: string;
    save_notes: string;
    download: string;
    no_tracks: string;
    drag_drop: string;
    or_click: string;
    uploading: string;
    remove: string;
    upload: string;
    advance_to: string;
    reset_to: string;
    status_raw: string;
    status_editing: string;
    status_edited: string;
    status_mastering: string;
    status_published: string;
    workflow: string;
    open_editor: string;
    auto_edit_title: string;
    auto_edit_start: string;
    auto_edit_starting: string;
    auto_edit_resume: string;
    auto_edit_no_source: string;
    auto_edit_done: string;
    auto_edit_failed: string;
    auto_edit_approve: string;
    auto_edit_reject: string;
    auto_edit_transcription: string;
    auto_edit_show_transcription: string;
    auto_edit_hide_transcription: string;
    auto_edit_select_stages: string;
    auto_edit_all_stages: string;
    auto_edit_stage_transcribe: string;
    auto_edit_stage_analyze: string;
    auto_edit_stage_clean: string;
    auto_edit_stage_mix: string;
    auto_edit_stage_master: string;
    auto_edit_status_pending: string;
    auto_edit_status_processing: string;
    auto_edit_status_done: string;
    auto_edit_status_failed: string;
    auto_edit_loading: string;
    auto_edit_no_transcription: string;
    auto_edit_action_remove: string;
    auto_edit_action_shorten: string;
    auto_edit_action_keep: string;
    auto_edit_legend: string;
  };
}

export function SessionDetailClient({ session: initialSession, isAdmin, userId, labels }: SessionDetailClientProps) {
  const [session, setSession] = useState(initialSession);
  const [editorNotes, setEditorNotes] = useState(session.editor_notes || '');
  const [adminNotes, setAdminNotes] = useState(session.admin_notes || '');
  const [saving, setSaving] = useState(false);

  const handleStatusChange = useCallback((newStatus: PublicationStatus) => {
    setSession((prev) => ({ ...prev, status: newStatus }));
  }, []);

  const handleUploadComplete = useCallback(
    async (tracks: { name: string; url: string; size: number }[]) => {
      const existingTracks = (session.edited_tracks || []) as TrackInfo[];
      const newTracks = [...existingTracks, ...tracks];

      const res = await fetch(`/api/publikacja/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_tracks: newTracks }),
      });

      if (res.ok) {
        setSession((prev) => ({ ...prev, edited_tracks: newTracks }));
      }
    },
    [session.id, session.edited_tracks]
  );

  const saveNotes = async () => {
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = { editor_notes: editorNotes };
      if (isAdmin) body.admin_notes = adminNotes;

      await fetch(`/api/publikacja/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Source tracks */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-serif font-bold text-htg-fg">{labels.source_tracks}</h3>
          {((session.source_tracks || []) as TrackInfo[]).length > 0 && (
            <Link
              href={{pathname: '/publikacja/edytor/[id]', params: {id: session.id}}}
              className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white text-sm font-medium rounded-lg hover:bg-htg-sage/90 transition-colors"
            >
              <Headphones className="w-4 h-4" />
              {labels.open_editor}
            </Link>
          )}
        </div>
        <TrackList
          tracks={(session.source_tracks || []) as TrackInfo[]}
          publicationId={session.id}
          type="source"
          labels={{ download: labels.download, no_tracks: labels.no_tracks }}
        />
      </div>

      {/* Auto-edit panel */}
      <AutoEditPanel
        publicationId={session.id}
        hasSourceTracks={((session.source_tracks || []) as TrackInfo[]).length > 0}
        initialAutoEditStatus={session.auto_edit_status}
        labels={{
          title: labels.auto_edit_title,
          start_pipeline: labels.auto_edit_start,
          starting: labels.auto_edit_starting,
          resume: labels.auto_edit_resume,
          no_source_tracks: labels.auto_edit_no_source,
          pipeline_done: labels.auto_edit_done,
          pipeline_failed: labels.auto_edit_failed,
          approve: labels.auto_edit_approve,
          reject: labels.auto_edit_reject,
          transcription: labels.auto_edit_transcription,
          show_transcription: labels.auto_edit_show_transcription,
          hide_transcription: labels.auto_edit_hide_transcription,
          select_stages: labels.auto_edit_select_stages,
          all_stages: labels.auto_edit_all_stages,
          stage_transcribe: labels.auto_edit_stage_transcribe,
          stage_analyze: labels.auto_edit_stage_analyze,
          stage_clean: labels.auto_edit_stage_clean,
          stage_mix: labels.auto_edit_stage_mix,
          stage_master: labels.auto_edit_stage_master,
          status_pending: labels.auto_edit_status_pending,
          status_processing: labels.auto_edit_status_processing,
          status_done: labels.auto_edit_status_done,
          status_failed: labels.auto_edit_status_failed,
          loading: labels.auto_edit_loading,
          no_transcription: labels.auto_edit_no_transcription,
          action_remove: labels.auto_edit_action_remove,
          action_shorten: labels.auto_edit_action_shorten,
          action_keep: labels.auto_edit_action_keep,
          legend: labels.auto_edit_legend,
        }}
      />

      {/* Edited tracks */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-4">{labels.edited_tracks}</h3>
        <TrackList
          tracks={(session.edited_tracks || []) as TrackInfo[]}
          publicationId={session.id}
          type="edited"
          labels={{ download: labels.download, no_tracks: labels.no_tracks }}
        />

        {/* Upload area (only when in editing status or admin) */}
        {(session.status === 'editing' || session.status === 'raw' || isAdmin) && (
          <div className="mt-6">
            <h4 className="text-sm font-medium text-htg-fg mb-3">{labels.upload_edited}</h4>
            <TrackUploader
              publicationId={session.id}
              type="edited"
              onUploadComplete={handleUploadComplete}
              labels={{
                drag_drop: labels.drag_drop,
                or_click: labels.or_click,
                uploading: labels.uploading,
                remove: labels.remove,
                upload: labels.upload,
              }}
            />
          </div>
        )}
      </div>

      {/* Status workflow */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-4">{labels.workflow}</h3>
        <StatusWorkflow
          publicationId={session.id}
          currentStatus={session.status}
          isAdmin={isAdmin}
          onStatusChange={handleStatusChange}
          labels={{
            advance_to: labels.advance_to,
            reset_to: labels.reset_to,
            status_raw: labels.status_raw,
            status_editing: labels.status_editing,
            status_edited: labels.status_edited,
            status_mastering: labels.status_mastering,
            status_published: labels.status_published,
          }}
        />
      </div>

      {/* Notes */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-htg-fg mb-1.5">{labels.editor_notes}</label>
          <textarea
            value={editorNotes}
            onChange={(e) => setEditorNotes(e.target.value)}
            placeholder={labels.notes_placeholder}
            rows={4}
            className="w-full px-4 py-2.5 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage resize-none"
          />
        </div>

        {isAdmin && (
          <div>
            <label className="block text-sm font-medium text-htg-fg mb-1.5">{labels.admin_notes}</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder={labels.notes_placeholder}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage resize-none"
            />
          </div>
        )}

        <button
          onClick={saveNotes}
          disabled={saving}
          className="px-4 py-2 bg-htg-sage text-white text-sm font-medium rounded-lg hover:bg-htg-sage/90 disabled:opacity-50 transition-colors"
        >
          {labels.save_notes}
        </button>
      </div>
    </div>
  );
}
