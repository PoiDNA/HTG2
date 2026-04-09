/**
 * Consent template generation constants.
 *
 * Maps numeric `consent_records.template_generation` (migration 057) to
 * named template versions. This is the single source of truth for template
 * generation numbers across the application.
 *
 * Used by:
 *   - `app/api/live/consent/route.ts` when writing new consent records
 *   - `check_processing_export_consent` RPC (migration 060) as gate: >= PRE_1
 *   - `consent_fingerprint` hash in processing service (hashed per record)
 *
 * Generation semantics:
 *   - 0 = pre-0 (historyczne, pre-PRE-1 commit 0409153) — legacy narrow scope
 *     "fazy sesyjnej". Not valid for processing service export.
 *   - 1 = pre-1 (commit 0409153) — 3 fazy (Wstęp/Sesja/Podsumowanie),
 *     AI subprocessors (OpenAI Whisper + Anthropic Claude), RODO art. 9.
 *     Minimum valid for processing service export.
 *   - 2 = pre-2 (future) — reserved dla przyszłych rozszerzeń (Voyage
 *     embeddings subprocessor, osobny processing_export consent, itd.).
 *     Phase 2+.
 *
 * **IMPORTANT:** if you modify the `consentTexts` object in
 * `app/api/live/consent/route.ts`, you MUST bump `CURRENT_CONSENT_TEMPLATE_GENERATION`
 * to the next value. The CI test in `lib/__tests__/consent-text-scope.test.ts`
 * enforces this invariant — it fails if the text is modified without a bump.
 *
 * This rule exists because `consent_fingerprint` in the processing service
 * is hashed over `template_generation` (among other fields). Silent text
 * changes without a bump would not invalidate cached Dossiers → users could
 * be analyzed under a consent text different from what they accepted.
 *
 * See: docs/processing-service-plan.md §3.1 punkt 1
 */

export const CONSENT_TEMPLATE_GENERATION = {
  PRE_0: 0,
  PRE_1: 1,
  PRE_2: 2, // reserved — future use
} as const;

export type ConsentTemplateGeneration =
  (typeof CONSENT_TEMPLATE_GENERATION)[keyof typeof CONSENT_TEMPLATE_GENERATION];

/**
 * The generation that new consent records are written with today.
 * Bump this when `consentTexts` in `app/api/live/consent/route.ts` changes.
 */
export const CURRENT_CONSENT_TEMPLATE_GENERATION: ConsentTemplateGeneration =
  CONSENT_TEMPLATE_GENERATION.PRE_1;

/**
 * Minimum template generation required for processing service export gate.
 * Older records (pre-0) had narrower scope that did not cover AI analytics
 * processing, so they are not valid for the dossier export pipeline.
 */
export const MIN_PROCESSING_EXPORT_TEMPLATE_GENERATION: ConsentTemplateGeneration =
  CONSENT_TEMPLATE_GENERATION.PRE_1;
