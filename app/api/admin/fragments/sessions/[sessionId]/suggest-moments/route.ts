import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/admin/fragments/sessions/[sessionId]/suggest-moments
 *
 * AI auto-typowanie kandydatów na Momenty. Claude dostaje segmenty aktywnego
 * importu mówców (start, end, speaker, role, text) i zwraca 3–8 kandydatów
 * o długości 20–180s z tytułem i krótkim uzasadnieniem.
 *
 * Odpowiedź: { ok: true, candidates: [...], elapsedMs }
 */

type Params = { params: Promise<{ sessionId: string }> };

export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

interface Candidate {
  startSec: number;
  endSec: number;
  title: string;
  reason: string;
}

const SYSTEM_PROMPT = `Jesteś asystentem typującym kandydatów na Momenty z sesji terapeutycznej.

DANE: lista segmentów transkrypcji z oznaczonymi mówcami.

ROLE mówców:
- „Natalia" (prowadząca, host) — zawsze istotna
- „Uczestnik" / nazwy uczestników (client) — zawsze istotne
- „Operator" / „Justyna" / „Agata" (assistant/operator) — obsługa techniczna, pomijać

ZASADY typowania:
1. Pomijaj fragmenty tylko z Operatorem/Justyną/Agatą — to obsługa techniczna.
2. Każdy Moment MUSI zaczynać się wypowiedzią Natalii lub Uczestnika (nigdy Operatora).
3. Wypowiedź Operatora może być WEWNĄTRZ Momentu, ale tylko gdy cały Moment trwa ≥60s i zawiera istotną treść Natalii/Uczestnika przed i po.
4. Szukaj kontekstowo domkniętych fragmentów: pytanie→odpowiedź, refleksja, insight, uzgodnienie celu, praca z emocją.
5. Minimum 20s, maksimum 180s na Moment. Typuj 3-8 kandydatów per sesja.
6. Dla każdego kandydata podaj: startSec (start pierwszego segmentu), endSec (koniec ostatniego segmentu), krótki title (max 80 znaków, po polsku, rzeczowy), reason (1 zdanie dlaczego).

ZWRÓĆ wyłącznie JSON: {"candidates": [{"startSec": number, "endSec": number, "title": string, "reason": string}]}`;

export async function POST(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const t0 = Date.now();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set' },
      { status: 500 },
    );
  }

  const db = createSupabaseServiceRole();

  // Aktywny import
  const { data: imp, error: impErr } = await db
    .from('session_speaker_imports')
    .select('id')
    .eq('session_template_id', sessionId)
    .eq('is_active', true)
    .maybeSingle();

  if (impErr) {
    const techDetails = `Nie można pobrać aktywnego importu: ${impErr.message}`;
    const userMsg = auth.role === 'admin'
      ? techDetails
      : 'Tymczasowy błąd — skontaktuj się z adminem i przekaż zrzut ekranu (htg@htg.cyou)';
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
  if (!imp) {
    return NextResponse.json(
      { error: 'Brak aktywnego importu mówców dla tej sesji' },
      { status: 404 },
    );
  }

  // Segmenty
  const { data: segRows, error: segErr } = await db
    .from('session_speaker_segments')
    .select('start_sec, end_sec, speaker_key, display_name, role, text')
    .eq('import_id', imp.id)
    .not('text', 'is', null)
    .order('start_sec', { ascending: true });

  if (segErr) {
    const techDetails = `Nie można pobrać segmentów: ${segErr.message}`;
    const userMsg = auth.role === 'admin'
      ? techDetails
      : 'Tymczasowy błąd — skontaktuj się z adminem i przekaż zrzut ekranu (htg@htg.cyou)';
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }

  const segments = (segRows ?? []).filter(
    (s) => typeof s.text === 'string' && (s.text as string).trim() !== '',
  );

  if (segments.length === 0) {
    return NextResponse.json(
      { error: 'Brak segmentów transkrypcji — najpierw uruchom diarize.' },
      { status: 400 },
    );
  }

  // Zbuduj listę [idx, startSec, endSec, speaker, role, text]
  const lines = segments.map((s, idx) => {
    const speaker = (s.display_name as string | null) || (s.speaker_key as string);
    const role = (s.role as string | null) ?? 'unknown';
    const start = Math.round(Number(s.start_sec) * 10) / 10;
    const end = Math.round(Number(s.end_sec) * 10) / 10;
    const text = ((s.text as string) ?? '').replace(/\s+/g, ' ').trim();
    return `[${idx}] ${start}-${end}s | ${speaker} (${role}): ${text}`;
  });

  const userContent = `Segmenty transkrypcji sesji:\n\n${lines.join('\n')}\n\nZwróć JSON z kandydatami na Momenty.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[suggest-moments] Claude API error', response.status, errText.slice(0, 300));
    const techDetails = `Claude API error ${response.status}: ${errText.slice(0, 200)}`;
    const userMsg = auth.role === 'admin'
      ? techDetails
      : 'Tymczasowy błąd — skontaktuj się z adminem i przekaż zrzut ekranu (htg@htg.cyou)';
    return NextResponse.json({ error: userMsg }, { status: 502 });
  }

  const data = await response.json();
  const text = data.content?.[0]?.type === 'text' ? (data.content[0].text as string) : '';

  // Wyłuskaj JSON — Claude może opakować w prose albo ```json ``` code fence.
  let parsed: { candidates?: unknown } | null = null;
  const codeFence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonSlice = codeFence ? codeFence[1] : text;
  const firstBrace = jsonSlice.indexOf('{');
  const lastBrace = jsonSlice.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      parsed = JSON.parse(jsonSlice.slice(firstBrace, lastBrace + 1));
    } catch (e) {
      console.error('[suggest-moments] JSON parse failed', e, jsonSlice.slice(0, 200));
    }
  }

  if (!parsed || !Array.isArray(parsed.candidates)) {
    const techDetails = `Claude nie zwrócił poprawnego JSON: ${text.slice(0, 200)}`;
    const userMsg = auth.role === 'admin'
      ? techDetails
      : 'Tymczasowy błąd — skontaktuj się z adminem i przekaż zrzut ekranu (htg@htg.cyou)';
    return NextResponse.json({ error: userMsg }, { status: 502 });
  }

  const candidates: Candidate[] = (parsed.candidates as unknown[])
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      const obj = c as Record<string, unknown>;
      const startSec = typeof obj.startSec === 'number' ? obj.startSec : Number(obj.startSec);
      const endSec = typeof obj.endSec === 'number' ? obj.endSec : Number(obj.endSec);
      const title = typeof obj.title === 'string' ? obj.title.trim() : '';
      const reason = typeof obj.reason === 'string' ? obj.reason.trim() : '';
      if (!isFinite(startSec) || !isFinite(endSec)) return null;
      if (endSec <= startSec) return null;
      if (!title) return null;
      return { startSec, endSec, title: title.slice(0, 80), reason };
    })
    .filter((c): c is Candidate => c !== null);

  return NextResponse.json({
    ok: true,
    candidates,
    elapsedMs: Date.now() - t0,
  });
}
