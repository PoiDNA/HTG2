import { NextRequest, NextResponse } from 'next/server';
import { requirePublication } from '@/lib/publication/auth';
import { runPipeline } from '@/lib/auto-edit/pipeline';
import type { PipelineStage } from '@/lib/auto-edit/types';
import { PIPELINE_STAGES } from '@/lib/auto-edit/types';

/**
 * POST /api/publikacja/auto-edit
 * Trigger the auto-edit pipeline for a publication.
 *
 * Body: { publicationId: string, stages?: PipelineStage[] }
 *
 * Returns immediately with a job confirmation.
 * Pipeline runs asynchronously in the background.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const { publicationId, stages } = body as {
    publicationId: string;
    stages?: PipelineStage[];
  };

  if (!publicationId) {
    return NextResponse.json({ error: 'publicationId is required' }, { status: 400 });
  }

  // Validate stages if provided
  if (stages) {
    for (const stage of stages) {
      if (!PIPELINE_STAGES.includes(stage)) {
        return NextResponse.json(
          { error: `Invalid stage: ${stage}. Valid stages: ${PIPELINE_STAGES.join(', ')}` },
          { status: 400 }
        );
      }
    }
  }

  // Verify publication exists and user has access
  const { supabase, user, isAdmin } = auth;
  const { data: publication } = await supabase
    .from('session_publications')
    .select('id, assigned_editor_id, source_tracks')
    .eq('id', publicationId)
    .single();

  if (!publication) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 });
  }

  if (!isAdmin && publication.assigned_editor_id && publication.assigned_editor_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!publication.source_tracks || publication.source_tracks.length === 0) {
    return NextResponse.json({ error: 'No source tracks available' }, { status: 400 });
  }

  // Fire and forget — pipeline runs in background
  // Using waitUntil pattern via edge runtime or just fire async
  runPipeline(publicationId, stages).catch((err) => {
    console.error(`[auto-edit] Background pipeline failed for ${publicationId}:`, err);
  });

  return NextResponse.json({
    message: 'Pipeline started',
    publicationId,
    stages: stages || PIPELINE_STAGES,
  });
}
