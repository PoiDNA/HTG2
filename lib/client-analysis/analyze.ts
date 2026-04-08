// Analyze a speaker-labeled transcript via Claude Sonnet 4.6 and return structured insights.
//
// Input: chronological SpeakerSegment[] spanning all 3 phases
// Output: ClientInsights JSON validated against expected shape
//
// NEVER persist raw model output to DB error column — only enum codes.

import type { SpeakerSegment, ClientInsights } from './types';
import { ANALYSIS_MODEL } from './types';
import { AnalysisError } from './errors';
import { CLIENT_ANALYSIS_SYSTEM_PROMPT } from './prompt';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Format transcript for Claude: one line per segment with phase, speaker, identity, time, text.
 */
function formatTranscriptForPrompt(segments: SpeakerSegment[]): string {
  const lines: string[] = [];
  let currentPhase = '';
  for (const s of segments) {
    if (s.phase !== currentPhase) {
      lines.push(`\n=== ${s.phase.toUpperCase()} ===`);
      currentPhase = s.phase;
    }
    const mm = Math.floor(s.start / 60);
    const ss = Math.floor(s.start % 60)
      .toString()
      .padStart(2, '0');
    lines.push(`[${mm}:${ss}] ${s.speaker}(${s.identity.slice(0, 8)}): ${s.text}`);
  }
  return lines.join('\n');
}

/**
 * Validate parsed JSON against ClientInsights shape. Returns the validated object
 * or throws AnalysisError('invalid_json_response').
 */
function validateInsights(parsed: unknown): ClientInsights {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new AnalysisError('invalid_json_response', 'not an object');
  }
  const p = parsed as Record<string, unknown>;
  const requireArray = (key: string): unknown[] => {
    if (!Array.isArray(p[key])) {
      throw new AnalysisError('invalid_json_response', `${key} must be an array`);
    }
    return p[key] as unknown[];
  };
  const requireString = (key: string): string => {
    if (typeof p[key] !== 'string') {
      throw new AnalysisError('invalid_json_response', `${key} must be a string`);
    }
    return p[key] as string;
  };

  return {
    problems: requireArray('problems') as ClientInsights['problems'],
    emotional_states: requireArray('emotional_states') as ClientInsights['emotional_states'],
    life_events: requireArray('life_events') as ClientInsights['life_events'],
    goals: requireArray('goals') as ClientInsights['goals'],
    breakthroughs: requireArray('breakthroughs') as ClientInsights['breakthroughs'],
    journey_summary: requireString('journey_summary'),
    summary: requireString('summary'),
  };
}

export async function analyzeSessionJourney(
  segments: SpeakerSegment[],
): Promise<ClientInsights> {
  if (segments.length === 0) {
    throw new AnalysisError('no_client_tracks', 'empty transcript');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnalysisError('claude_api_error', 'ANTHROPIC_API_KEY not configured');
  }

  const formattedText = formatTranscriptForPrompt(segments);
  const totalDuration = Math.max(...segments.map((s) => s.end));

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        max_tokens: 8192,
        system: CLIENT_ANALYSIS_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Przeanalizuj poniższy transkrypt sesji HTG (łączny czas: ${totalDuration.toFixed(0)}s).\n\n${formattedText}`,
          },
        ],
      }),
    });
  } catch (e) {
    throw new AnalysisError('claude_api_error', `network: ${(e as Error)?.message}`);
  }

  if (!res.ok) {
    console.warn(`[client-analysis] Claude API ${res.status}`);
    throw new AnalysisError('claude_api_error', `status_${res.status}`);
  }

  const response = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = response.content?.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new AnalysisError('invalid_json_response', 'no text content in response');
  }

  // Strip markdown fences if present (same pattern as lib/auto-edit/analyze.ts)
  let raw = textBlock.text.trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    raw = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AnalysisError('invalid_json_response', 'JSON.parse failed');
  }

  return validateInsights(parsed);
}
