// ============================================================
// Auto-edit pipeline types
// ============================================================

/** A single word with precise timing from Whisper transcription */
export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
}

/** Full transcription result for a single track */
export interface TranscriptionResult {
  trackName: string;
  trackUrl: string;
  text: string;
  words: TranscriptionWord[];
  duration: number;
  language: string;
}

/** Action to apply on a segment of audio */
export type EditActionType = 'remove' | 'shorten' | 'keep';

/** A single edit action in the edit plan */
export interface EditAction {
  start: number;
  end: number;
  action: EditActionType;
  reason?: string;
  /** For 'shorten' action — target duration in seconds */
  targetDuration?: number;
}

/** Complete edit plan returned by Claude analysis */
export interface EditPlan {
  actions: EditAction[];
  summary: string;
  estimatedSavedSeconds: number;
}

/** Pipeline stage names */
export type PipelineStage = 'transcribe' | 'analyze' | 'clean' | 'mix' | 'master';

/** Status of an individual stage */
export type StageStatus = 'pending' | 'processing' | 'done' | 'failed';

/** Progress info for a single stage */
export interface StageProgress {
  status: StageStatus;
  progress?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

/** Overall pipeline status stored in session_publications.metadata */
export interface AutoEditMetadata {
  status: 'idle' | 'processing' | 'done' | 'failed';
  currentStage?: PipelineStage;
  stages: Record<PipelineStage, StageProgress>;
  transcriptions?: TranscriptionResult[];
  editPlan?: EditPlan;
  cleanedTrackUrls?: string[];
  mixedUrl?: string;
  masteredUrl?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

/** Shape of pipeline progress returned to the client */
export interface PipelineProgressResponse {
  status: AutoEditMetadata['status'];
  currentStage?: PipelineStage;
  stages: Record<PipelineStage, StageProgress>;
  masteredUrl?: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'transcribe',
  'analyze',
  'clean',
  'mix',
  'master',
];

export function createInitialAutoEditMetadata(): AutoEditMetadata {
  return {
    status: 'idle',
    stages: {
      transcribe: { status: 'pending' },
      analyze: { status: 'pending' },
      clean: { status: 'pending' },
      mix: { status: 'pending' },
      master: { status: 'pending' },
    },
  };
}
