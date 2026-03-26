// ============================================================
// Auto-edit pipeline orchestrator
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { downloadFile, uploadFile } from '@/lib/bunny-storage';
import { transcribeAllTracks } from './transcribe';
import { analyzeTranscription } from './analyze';
import { cleanTrack } from './clean';
import { mixTracks } from './mix';
import { masterAudio } from './master';
import type {
  AutoEditMetadata,
  PipelineStage,
  StageProgress,
  TranscriptionResult,
  EditPlan,
} from './types';
import { PIPELINE_STAGES, createInitialAutoEditMetadata } from './types';

/**
 * Create a Supabase admin client for pipeline operations.
 * Uses service role key so background processing can update records.
 */
function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE env vars for pipeline');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Get the current auto_edit metadata from a publication record.
 */
async function getAutoEditMetadata(publicationId: string): Promise<AutoEditMetadata | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('session_publications')
    .select('auto_edit_status')
    .eq('id', publicationId)
    .single();

  if (!data?.auto_edit_status) return null;

  try {
    return typeof data.auto_edit_status === 'string'
      ? JSON.parse(data.auto_edit_status)
      : data.auto_edit_status;
  } catch {
    return null;
  }
}

/**
 * Persist the auto_edit metadata to the publication record.
 */
async function saveAutoEditMetadata(
  publicationId: string,
  metadata: AutoEditMetadata
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('session_publications')
    .update({
      auto_edit_status: JSON.stringify(metadata),
      updated_at: new Date().toISOString(),
    })
    .eq('id', publicationId);

  if (error) {
    console.error('[auto-edit] Failed to save metadata:', error.message);
  }
}

/**
 * Update a single stage's progress and persist.
 */
async function updateStage(
  publicationId: string,
  metadata: AutoEditMetadata,
  stage: PipelineStage,
  progress: Partial<StageProgress>
): Promise<void> {
  metadata.stages[stage] = { ...metadata.stages[stage], ...progress };
  metadata.currentStage = stage;
  await saveAutoEditMetadata(publicationId, metadata);
}

/**
 * Download a file from Bunny CDN/Storage given its URL.
 * Handles both CDN URLs and storage paths.
 */
async function downloadTrackFile(url: string): Promise<ArrayBuffer> {
  // If it's a CDN URL, extract the path for storage download
  const cdnUrl = process.env.NEXT_PUBLIC_BUNNY_CDN_URL || 'https://htg2-cdn.b-cdn.net';
  if (url.startsWith(cdnUrl)) {
    const path = url.replace(cdnUrl, '').replace(/^\//, '');
    const result = await downloadFile(path);
    return result.buffer;
  }

  // If it's a storage URL, extract path
  const storageHostname = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
  const storageZone = process.env.BUNNY_STORAGE_ZONE || 'htg2';
  const storagePrefix = `https://${storageHostname}/${storageZone}/`;
  if (url.startsWith(storagePrefix)) {
    const path = url.replace(storagePrefix, '');
    const result = await downloadFile(path);
    return result.buffer;
  }

  // Fallback: direct fetch
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Run the full auto-edit pipeline or specific stages.
 *
 * This function runs asynchronously and updates progress in the database.
 * It can resume from a failed stage if stages parameter is provided.
 */
export async function runPipeline(
  publicationId: string,
  stages?: PipelineStage[]
): Promise<void> {
  const stagesToRun = stages || PIPELINE_STAGES;

  // Load or create metadata
  let metadata = await getAutoEditMetadata(publicationId);
  if (!metadata) {
    metadata = createInitialAutoEditMetadata();
  }

  metadata.status = 'processing';
  metadata.startedAt = new Date().toISOString();
  metadata.error = undefined;
  await saveAutoEditMetadata(publicationId, metadata);

  // Load the publication record to get source tracks
  const supabase = createAdminClient();
  const { data: publication } = await supabase
    .from('session_publications')
    .select('source_tracks')
    .eq('id', publicationId)
    .single();

  if (!publication?.source_tracks || publication.source_tracks.length === 0) {
    metadata.status = 'failed';
    metadata.error = 'No source tracks found';
    await saveAutoEditMetadata(publicationId, metadata);
    throw new Error('No source tracks found for publication');
  }

  const sourceTracks = publication.source_tracks as { name: string; url: string }[];

  try {
    // Stage 1: TRANSCRIBE
    if (stagesToRun.includes('transcribe')) {
      await updateStage(publicationId, metadata, 'transcribe', {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      console.log(`[auto-edit] Starting transcription for ${sourceTracks.length} tracks`);
      const transcriptions = await transcribeAllTracks(sourceTracks, downloadTrackFile);
      metadata.transcriptions = transcriptions;

      await updateStage(publicationId, metadata, 'transcribe', {
        status: 'done',
        progress: 1,
        finishedAt: new Date().toISOString(),
      });
      console.log('[auto-edit] Transcription complete');
    }

    // Stage 2: ANALYZE
    if (stagesToRun.includes('analyze')) {
      if (!metadata.transcriptions || metadata.transcriptions.length === 0) {
        throw new Error('No transcriptions available — run transcribe stage first');
      }

      await updateStage(publicationId, metadata, 'analyze', {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      console.log('[auto-edit] Starting analysis with Claude');
      const editPlan = await analyzeTranscription(metadata.transcriptions);
      metadata.editPlan = editPlan;

      await updateStage(publicationId, metadata, 'analyze', {
        status: 'done',
        progress: 1,
        finishedAt: new Date().toISOString(),
      });
      console.log(`[auto-edit] Analysis complete: ${editPlan.actions.length} edit actions, ~${editPlan.estimatedSavedSeconds.toFixed(0)}s saved`);
    }

    // Stage 3: CLEAN
    if (stagesToRun.includes('clean')) {
      if (!metadata.editPlan) {
        throw new Error('No edit plan available — run analyze stage first');
      }

      await updateStage(publicationId, metadata, 'clean', {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      const cleanedUrls: string[] = [];
      for (let i = 0; i < sourceTracks.length; i++) {
        const track = sourceTracks[i];
        console.log(`[auto-edit] Cleaning track ${i + 1}/${sourceTracks.length}: ${track.name}`);

        const audioBuffer = await downloadTrackFile(track.url);
        const cleanedBuffer = await cleanTrack(audioBuffer, metadata.editPlan);

        // Upload cleaned track
        const cleanPath = `publications/${publicationId}/auto-edit/cleaned_${track.name}`;
        const uploaded = await uploadFile(cleanPath, cleanedBuffer);
        cleanedUrls.push(uploaded.cdnUrl);

        await updateStage(publicationId, metadata, 'clean', {
          progress: (i + 1) / sourceTracks.length,
        });
      }

      metadata.cleanedTrackUrls = cleanedUrls;

      // Also save cleaned tracks to the publication record
      const cleanedTrackInfos = cleanedUrls.map((url, i) => ({
        name: `cleaned_${sourceTracks[i].name}`,
        url,
      }));
      await supabase
        .from('session_publications')
        .update({ auto_cleaned_tracks: cleanedTrackInfos })
        .eq('id', publicationId);

      await updateStage(publicationId, metadata, 'clean', {
        status: 'done',
        progress: 1,
        finishedAt: new Date().toISOString(),
      });
      console.log('[auto-edit] Cleaning complete');
    }

    // Stage 4: MIX
    if (stagesToRun.includes('mix')) {
      if (!metadata.cleanedTrackUrls || metadata.cleanedTrackUrls.length === 0) {
        throw new Error('No cleaned tracks available — run clean stage first');
      }

      await updateStage(publicationId, metadata, 'mix', {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      console.log('[auto-edit] Downloading cleaned tracks for mixing');
      const cleanedBuffers: ArrayBuffer[] = [];
      for (const url of metadata.cleanedTrackUrls) {
        cleanedBuffers.push(await downloadTrackFile(url));
      }

      // TODO: Load intro/outro music from configured URLs
      // For now, mix without intro/outro
      console.log('[auto-edit] Mixing tracks');
      const mixedBuffer = await mixTracks(cleanedBuffers);

      const mixPath = `publications/${publicationId}/auto-edit/mixed.wav`;
      const mixUploaded = await uploadFile(mixPath, mixedBuffer);
      metadata.mixedUrl = mixUploaded.cdnUrl;

      await supabase
        .from('session_publications')
        .update({ auto_mixed_url: mixUploaded.cdnUrl })
        .eq('id', publicationId);

      await updateStage(publicationId, metadata, 'mix', {
        status: 'done',
        progress: 1,
        finishedAt: new Date().toISOString(),
      });
      console.log('[auto-edit] Mixing complete');
    }

    // Stage 5: MASTER
    if (stagesToRun.includes('master')) {
      if (!metadata.mixedUrl) {
        throw new Error('No mixed audio available — run mix stage first');
      }

      await updateStage(publicationId, metadata, 'master', {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      console.log('[auto-edit] Downloading mixed track for mastering');
      const mixedBuffer = await downloadTrackFile(metadata.mixedUrl);

      console.log('[auto-edit] Mastering audio');
      const masteredBuffer = await masterAudio(mixedBuffer);

      const masterPath = `publications/${publicationId}/auto-edit/mastered.wav`;
      const masterUploaded = await uploadFile(masterPath, masteredBuffer);
      metadata.masteredUrl = masterUploaded.cdnUrl;

      await supabase
        .from('session_publications')
        .update({ mastered_url: masterUploaded.cdnUrl })
        .eq('id', publicationId);

      await updateStage(publicationId, metadata, 'master', {
        status: 'done',
        progress: 1,
        finishedAt: new Date().toISOString(),
      });
      console.log('[auto-edit] Mastering complete');
    }

    // All stages done
    metadata.status = 'done';
    metadata.finishedAt = new Date().toISOString();
    await saveAutoEditMetadata(publicationId, metadata);
    console.log(`[auto-edit] Pipeline complete for publication ${publicationId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[auto-edit] Pipeline failed: ${errorMessage}`);

    // Mark current stage as failed
    if (metadata.currentStage) {
      metadata.stages[metadata.currentStage].status = 'failed';
      metadata.stages[metadata.currentStage].error = errorMessage;
    }
    metadata.status = 'failed';
    metadata.error = errorMessage;
    await saveAutoEditMetadata(publicationId, metadata);

    throw error;
  }
}
