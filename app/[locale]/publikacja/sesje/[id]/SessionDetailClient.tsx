'use client';

import { useState, useCallback } from 'react';
import { TrackList } from '@/components/publikacja/TrackList';
import { TrackUploader } from '@/components/publikacja/TrackUploader';
import { StatusWorkflow } from '@/components/publikacja/StatusWorkflow';
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
              href={`/publikacja/edytor/${session.id}`}
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
