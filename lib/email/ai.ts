// ============================================================
// HTG Communication Hub — AI Analysis (Claude Haiku)
// Context-aware, PII-safe, channel-aware
// ============================================================

import type { CustomerCard, AIAnalysisResult } from './types';
import { formatCustomerCardForAI } from './context';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_BODY_CHARS = 15_000;

const SYSTEM_PROMPT_BASE = `Jesteś inteligentnym asystentem systemu obsługi klienta HTG (Hacking The Game — sesje rozwoju osobistego z Natalią).

ZADANIE: Przeanalizuj przychodzącą wiadomość i zwróć JSON z polami:
- category: jedna z [rezerwacja, płatność, techniczne, pytanie, feedback, reklamacja, partnerstwo, spam, inne]
- sentiment: positive | neutral | negative
- summary: 1-zdaniowe streszczenie po polsku (max 100 znaków)
- suggestedReply: gotowy projekt odpowiedzi po polsku (uprzejmy, profesjonalny, ciepły ton HTG)
- suggestedPriority: low | normal | high | urgent

REGUŁY:
- Odpowiadaj WYŁĄCZNIE poprawnym JSON (bez komentarzy, bez markdown)
- Sugerowana odpowiedź ma być gotowa do wysłania (z powitaniem i podpisem "Zespół HTG")
- Jeśli masz dane klienta (karta_klienta) — personalizuj odpowiedź (imię, nawiązanie do sesji/zamówienia)
- Priorytet "urgent" tylko gdy: zagubiona płatność, sesja w ciągu 24h, problem z dostępem
- Priorytet "high" gdy: zmiana terminu, reklamacja, pytanie o fakturę`;

const UNVERIFIED_ADDENDUM = `

WAŻNE: Nadawca jest NIEZWERYFIKOWANY. NIE MASZ dostępu do jego danych (zamówień, sesji, płatności).
- NIE twierdź, że klient nie ma konta lub zamówień
- NIE podawaj żadnych szczegółów konta
- Generuj ogólną, pomocną odpowiedź
- Na końcu suggestedReply dodaj: "[Uwaga dla admina: kliknij przycisk 'Wyślij Weryfikację' aby odblokować dane klienta przed wysłaniem tej odpowiedzi]"`;

const SMS_ADDENDUM = `

KANAŁ: SMS. Sugerowana odpowiedź musi mieć MAKSYMALNIE 70 znaków (polskie znaki = kodowanie UCS-2, limit 70 nie 160).`;

export async function analyzeMessage(
  subject: string | null,
  bodyText: string | null,
  customerCard: CustomerCard,
  channel: string = 'email'
): Promise<AIAnalysisResult | null> {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    return null;
  }

  // Build system prompt
  let systemPrompt = SYSTEM_PROMPT_BASE;

  // Add customer card context (only if verified or guest)
  if (!customerCard.isGuest && customerCard.recentOrders) {
    // Verified user — include full card
    systemPrompt += '\n\n' + formatCustomerCardForAI(customerCard);
  } else if (!customerCard.isGuest) {
    // Unverified — add restriction
    systemPrompt += UNVERIFIED_ADDENDUM;
  }
  // Guest: no card, no restriction — just generic analysis

  if (channel === 'sms') {
    systemPrompt += SMS_ADDENDUM;
  }

  // Truncate body
  const truncatedBody = bodyText
    ? bodyText.slice(0, MAX_BODY_CHARS)
    : '(brak treści)';

  const userMessage = subject
    ? `Temat: ${subject}\n\nTreść:\n${truncatedBody}`
    : truncatedBody;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      console.error('Anthropic API error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;

    // Parse JSON from response (Claude may wrap in ```json)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      category: parsed.category || 'inne',
      sentiment: parsed.sentiment || 'neutral',
      summary: parsed.summary || '',
      suggestedReply: parsed.suggestedReply || '',
      suggestedPriority: parsed.suggestedPriority || 'normal',
    };
  } catch (err) {
    console.error('AI analysis error:', err);
    return null;
  }
}
