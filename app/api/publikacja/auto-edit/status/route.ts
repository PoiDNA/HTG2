import { NextRequest, NextResponse } from 'next/server';
import { requirePublication } from '@/lib/publication/auth';
import type { AutoEditMetadata, PipelineProgressResponse } from '@/lib/auto-edit/types';
import { createInitialAutoEditMetadata } from '@/lib/auto-edit/types';

/**
 * GET /api/publikacja/auto-edit/status?publicationId=xxx
 * Returns the current pipeline status and progress.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const publicationId = searchParams.get('publicationId');

  if (!publicationId) {
    return NextResponse.json({ error: 'publicationId is required' }, { status: 400 });
  }

  const { supabase, user, isAdmin } = auth;

  const { data: publication } = await supabase
    .from('session_publications')
    .select('id, assigned_editor_id, auto_edit_status')
    .eq('id', publicationId)
    .single();

  if (!publication) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 });
  }

  if (!isAdmin && publication.assigned_editor_id && publication.assigned_editor_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse auto_edit_status
  let metadata: AutoEditMetadata;
  if (publication.auto_edit_status) {
    try {
      metadata =
        typeof publication.auto_edit_status === 'string'
          ? JSON.parse(publication.auto_edit_status)
          : publication.auto_edit_status;
    } catch {
      metadata = createInitialAutoEditMetadata();
    }
  } else {
    metadata = createInitialAutoEditMetadata();
  }

  // Return a progress-only response (no heavy transcription/plan data)
  const response: PipelineProgressResponse = {
    status: metadata.status,
    currentStage: metadata.currentStage,
    stages: metadata.stages,
    masteredUrl: metadata.masteredUrl,
  };

  return NextResponse.json(response);
}
