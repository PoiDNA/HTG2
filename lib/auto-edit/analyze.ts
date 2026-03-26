// ============================================================
// Analysis stage — Claude API for edit plan generation
// ============================================================

import type { TranscriptionResult, EditPlan, EditAction } from './types';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `Jesteś ekspertem od edycji audio sesji rozwoju duchowego (HTG — sesje z Natalią).
Twoje zadanie: przeanalizować transkrypcję nagrania i zaproponować plan edycji.

KONTEKST:
- To są nagrania sesji duchowych / terapeutycznych
- Niektóre pauzy i cisze są CELOWE i WAŻNE (medytacja, chwile refleksji)
- Prowadząca (Natalia) czasem robi świadome pauzy — NIE USUWAJ ICH
- Uczestniczki mogą się wzruszać — te momenty są cenne

CO USUNĄĆ:
- Słowa-wypełniacze: "ą", "ę", "ah", "uh", "hmm", "mhm", "eee", "yyy", "no"
- Mruczenie bez znaczenia
- Szumy, trzaski, artefakty techniczne
- Powtórzenia wyrazów (jąkanie, "ja, ja, ja chciałam")
- "Halo?", "Słyszycie mnie?" — kwestie techniczne

CO SKRÓCIĆ:
- Cisze dłuższe niż 3 sekundy → skróć do 1.5 sekundy
- ALE: cisza po pytaniu lub w trakcie medytacji → ZACHOWAJ (oznacz jako 'keep')
- Długie przerwy techniczne (np. problemy z mikrofonem)

CO BEZWZGLĘDNIE ZACHOWAĆ:
- Wypowiedzi merytoryczne prowadzącej i uczestników
- Momenty emocjonalne (płacz, wzruszenie, śmiech)
- Pauzy medytacyjne i kontemplacyjne
- Instrukcje, afirmacje, wizualizacje
- Odpowiedzi na pytania uczestników

ZASADA NADRZĘDNA: Lepiej zachować za dużo niż wyciąć za dużo.
W razie wątpliwości — ZACHOWAJ segment.

Odpowiedz WYŁĄCZNIE poprawnym JSON w formacie:
{
  "actions": [
    { "start": 0.0, "end": 0.5, "action": "remove", "reason": "filler word" },
    { "start": 5.0, "end": 8.5, "action": "shorten", "reason": "long silence", "targetDuration": 1.5 },
    { "start": 10.0, "end": 45.0, "action": "keep", "reason": "meditation guidance" }
  ],
  "summary": "Krótki opis zmian",
  "estimatedSavedSeconds": 30.5
}`;

/**
 * Format transcriptions into a readable text for Claude.
 */
function formatTranscriptionsForPrompt(transcriptions: TranscriptionResult[]): string {
  const parts: string[] = [];

  for (const t of transcriptions) {
    parts.push(`=== Ścieżka: ${t.trackName} (${t.duration.toFixed(1)}s) ===`);

    // Group words into segments with timestamps
    const lines: string[] = [];
    let currentLine = '';
    let lineStart = 0;

    for (const w of t.words) {
      if (!currentLine) {
        lineStart = w.start;
        currentLine = w.word;
      } else if (w.start - lineStart > 10) {
        // New line every ~10 seconds
        lines.push(`[${formatTime(lineStart)}] ${currentLine.trim()}`);
        lineStart = w.start;
        currentLine = w.word;
      } else {
        currentLine += ' ' + w.word;
      }
    }

    if (currentLine) {
      lines.push(`[${formatTime(lineStart)}] ${currentLine.trim()}`);
    }

    parts.push(lines.join('\n'));

    // Also include silence detection hints
    const silences = detectSilences(t.words, t.duration);
    if (silences.length > 0) {
      parts.push('\nWykryte cisze:');
      for (const s of silences) {
        parts.push(`  [${formatTime(s.start)} - ${formatTime(s.end)}] ${s.duration.toFixed(1)}s`);
      }
    }

    parts.push('');
  }

  return parts.join('\n');
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

interface SilenceSegment {
  start: number;
  end: number;
  duration: number;
}

function detectSilences(words: TranscriptionResult['words'], totalDuration: number): SilenceSegment[] {
  const silences: SilenceSegment[] = [];
  const MIN_SILENCE = 2.0; // Only report silences > 2s

  // Check gap before first word
  if (words.length > 0 && words[0].start > MIN_SILENCE) {
    silences.push({
      start: 0,
      end: words[0].start,
      duration: words[0].start,
    });
  }

  // Check gaps between words
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > MIN_SILENCE) {
      silences.push({
        start: words[i - 1].end,
        end: words[i].start,
        duration: gap,
      });
    }
  }

  // Check gap after last word
  if (words.length > 0) {
    const lastEnd = words[words.length - 1].end;
    if (totalDuration - lastEnd > MIN_SILENCE) {
      silences.push({
        start: lastEnd,
        end: totalDuration,
        duration: totalDuration - lastEnd,
      });
    }
  }

  return silences;
}

/**
 * Analyze transcriptions and generate an edit plan using Claude.
 */
export async function analyzeTranscription(
  transcriptions: TranscriptionResult[]
): Promise<EditPlan> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const formattedText = formatTranscriptionsForPrompt(transcriptions);
  const totalDuration = transcriptions.reduce((sum, t) => Math.max(sum, t.duration), 0);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Przeanalizuj poniższą transkrypcję sesji (łączny czas: ${totalDuration.toFixed(0)}s) i zaproponuj plan edycji.\n\n${formattedText}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errText}`);
  }

  const response = await res.json();

  // Extract text content from response
  const textBlock = response.content?.find((block: { type: string }) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const rawText = textBlock.text.trim();

  // Parse JSON — handle potential markdown code blocks
  let jsonStr = rawText;
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let parsed: { actions: EditAction[]; summary: string; estimatedSavedSeconds: number };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Claude edit plan JSON: ${rawText.slice(0, 200)}`);
  }

  // Validate and sort actions by start time
  const actions = (parsed.actions || [])
    .filter((a) => a.start != null && a.end != null && a.action)
    .sort((a, b) => a.start - b.start);

  return {
    actions,
    summary: parsed.summary || 'Plan edycji wygenerowany automatycznie',
    estimatedSavedSeconds: parsed.estimatedSavedSeconds || 0,
  };
}
