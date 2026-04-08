// Types for client journey analysis pipeline.
// All insights carry a `phase` field so Claude can reason about progression
// across wstep → sesja → podsumowanie.

export type Phase = 'wstep' | 'sesja' | 'podsumowanie';
export type SpeakerRole = 'client' | 'host' | 'assistant' | 'unknown';

export interface SpeakerSegment {
  phase: Phase;
  speaker: SpeakerRole;
  identity: string;
  name: string;
  start: number;   // offset within the phase, not globally
  end: number;
  text: string;
}

export interface ProblemInsight {
  phase: Phase;
  identity?: string;
  topic: string;
  quote: string;
  severity: 'low' | 'medium' | 'high';
}

export interface EmotionalStateInsight {
  phase: Phase;
  identity?: string;
  emotion: string;
  trigger: string;
  timestamp_s: number;
  quote: string;
}

export interface LifeEventInsight {
  phase: Phase;
  identity?: string;
  event: string;
  year?: number;
  people?: string[];
  quote: string;
}

export interface GoalInsight {
  phase: Phase;
  identity?: string;
  goal: string;
  quote: string;
}

export interface BreakthroughInsight {
  phase: 'sesja' | 'podsumowanie';
  identity?: string;
  insight: string;
  quote: string;
  timestamp_s: number;
}

export interface ClientInsights {
  problems: ProblemInsight[];
  emotional_states: EmotionalStateInsight[];
  life_events: LifeEventInsight[];
  goals: GoalInsight[];
  breakthroughs: BreakthroughInsight[];
  journey_summary: string;
  summary: string;
}

export const ANALYSIS_PROMPT_VERSION = 'v1-2026-04';
export const ANALYSIS_MODEL = 'claude-sonnet-4-6';
export const TRANSCRIPT_MODEL = 'whisper-1';
