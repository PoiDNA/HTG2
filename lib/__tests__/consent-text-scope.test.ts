// Regression test: consent text scope for PRE-1 (client analytics pipeline).
//
// After flipping CLIENT_ANALYTICS_ENABLED=true on prod, the system processes
// all 3 phases of a session (Wstęp, Sesja, Podsumowanie) plus routes transcripts
// through OpenAI Whisper and Anthropic Claude as subprocessors. RODO requires
// that the consent text explicitly covers what the system actually does:
//   - all 3 phases (not just "fazy sesyjnej")
//   - the AI subprocessors by name
//   - art. 9 health data handling
//
// This test ensures future refactors don't narrow the scope back to sesja-only
// and don't drop the subprocessor disclosures. Both the backend-stored text
// (consent_records.consent_text for audit) and the user-facing UI checkbox
// label must cover the same scope.
//
// Extended for PR htg-proc-p1 (mig 057+): invariant linking consent text
// changes to template_generation bumps. See the last describe block.

import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf-8');
}

describe('Consent text scope — 3 phases + AI analytics', () => {
  const backendText = read('app/api/live/consent/route.ts');
  const uiText = read('components/live/PreJoinCheck.tsx');

  describe('backend (consent_records.consent_text)', () => {
    it('mentions all three phases by name', () => {
      expect(backendText).toContain('Wstęp');
      expect(backendText).toContain('Sesja');
      expect(backendText).toContain('Podsumowanie');
    });

    it('mentions AI analysis', () => {
      expect(backendText).toMatch(/AI|analiz/i);
    });

    it('names OpenAI Whisper and Anthropic Claude as subprocessors', () => {
      expect(backendText).toContain('OpenAI');
      expect(backendText).toContain('Whisper');
      expect(backendText).toContain('Anthropic');
      expect(backendText).toContain('Claude');
    });

    it('references RODO art. 9 (health data)', () => {
      expect(backendText).toMatch(/art\.?\s*9|art 9|art\. 9/);
    });

    it('mentions right to withdraw consent + deletion', () => {
      expect(backendText).toMatch(/wycofa/);
      expect(backendText).toMatch(/usuni/);
    });
  });

  describe('UI checkbox (PreJoinCheck.tsx)', () => {
    it('mentions all three phases by name', () => {
      // The UI label should visibly list the 3 phases so users know what
      // they are consenting to before clicking.
      expect(uiText).toContain('Wstęp');
      expect(uiText).toContain('Sesja');
      expect(uiText).toContain('Podsumowanie');
    });

    it('mentions AI analysis', () => {
      expect(uiText).toMatch(/AI|analiz/i);
    });

    it('names OpenAI Whisper and Anthropic Claude as subprocessors', () => {
      expect(uiText).toContain('OpenAI');
      expect(uiText).toContain('Whisper');
      expect(uiText).toContain('Anthropic');
      expect(uiText).toContain('Claude');
    });

    it('references RODO art. 9', () => {
      expect(uiText).toMatch(/art\.?\s*9/);
    });
  });

  describe('scope regression (must not return to sesja-only)', () => {
    it('backend does not claim only "fazy sesyjnej"', () => {
      // Old text was "utrwalenie fazy sesyjnej mojego spotkania" — too narrow
      // once analytics process wstep/podsumowanie too.
      const hasOldNarrowText = /utrwalenie\s+fazy\s+sesyjnej/i.test(backendText);
      expect(hasOldNarrowText).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Invariant: consent text changes → template_generation bump
  // ═══════════════════════════════════════════════════════════════
  //
  // Added for PR htg-proc-p1 (mig 057 + lib/consent/template.ts).
  //
  // `check_processing_export_consent` RPC (mig 060) gates on
  // `template_generation >= PRE_1 (1)`. The `consent_fingerprint` used by the
  // processing service hashes `template_generation` among other fields — so
  // any silent change to consent text without a template bump would leave
  // cached Dossiers valid under a consent the user never accepted.
  //
  // This test pins a hash of the current consent text. If you modify
  // `consentTexts` in `app/api/live/consent/route.ts` you MUST either:
  //   (a) bump `CURRENT_CONSENT_TEMPLATE_GENERATION` in lib/consent/template.ts
  //       from PRE_1 → PRE_2, and update EXPECTED_CONSENT_TEXT_HASH below, OR
  //   (b) justify in PR review why the change is semantically equivalent
  //       (typo fix, whitespace, etc) and update EXPECTED_CONSENT_TEXT_HASH.
  //
  // Either way, this test failure is intentional: it forces a conscious
  // decision whenever consent text is modified. Do NOT just update the hash
  // without also considering whether the bump is needed.
  describe('template_generation invariant (mig 057)', () => {
    // Extracts the `consentTexts` record literal from the backend route.
    // We hash only the text values, not whitespace/comments/imports, so
    // unrelated refactors don't trigger the invariant.
    function extractConsentTexts(source: string): string[] {
      const match = source.match(
        /consentTexts:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\};/,
      );
      if (!match) return [];
      const block = match[1];
      // Match each 'key: "..."' or "key: '...'" entry including multi-line
      // concatenated string literals.
      const entries: string[] = [];
      // Matches: session_recording_capture: 'text' + 'more' + ...
      const entryRegex = /(\w+):\s*((?:'[^']*'(?:\s*\+\s*'[^']*')*)|(?:"[^"]*"(?:\s*\+\s*"[^"]*")*))/g;
      let m: RegExpExecArray | null;
      while ((m = entryRegex.exec(block)) !== null) {
        // Reconstruct the string literal value — strip quotes and concat operators.
        const literal = m[2]
          .replace(/\s*\+\s*/g, '')
          .replace(/^['"]|['"]$/g, '')
          .replace(/['"]\s*['"]/g, '');
        entries.push(`${m[1]}:${literal}`);
      }
      return entries.sort();
    }

    const consentTexts = extractConsentTexts(backendText);
    const canonicalHash = createHash('sha256')
      .update(consentTexts.join('\n'))
      .digest('hex');

    // Pinned hash — bump this together with CURRENT_CONSENT_TEMPLATE_GENERATION
    // if you intentionally change the consent text. See block comment above.
    const EXPECTED_CONSENT_TEXT_HASH =
      '364574ef69912344e5da1df77f16cb9695cc8c0604e4e34b77697efea985d5fd';

    it('extracted at least 2 consentTexts entries (sanity)', () => {
      // If this fails, the regex above broke — consentTexts might have been
      // restructured. Fix the extractor before touching EXPECTED_CONSENT_TEXT_HASH.
      expect(consentTexts.length).toBeGreaterThanOrEqual(2);
      expect(consentTexts.some((e) => e.startsWith('session_recording_capture:'))).toBe(true);
      expect(consentTexts.some((e) => e.startsWith('session_recording_access:'))).toBe(true);
    });

    it('consent text hash matches pinned value — bump template_generation if intentional', () => {
      // eslint-disable-next-line no-console
      if (canonicalHash !== EXPECTED_CONSENT_TEXT_HASH) {
        console.error(
          '\n⚠️  Consent text changed!\n' +
          `   Current hash:  ${canonicalHash}\n` +
          `   Expected hash: ${EXPECTED_CONSENT_TEXT_HASH}\n` +
          '\n' +
          '   If this is intentional:\n' +
          '   1. Bump CURRENT_CONSENT_TEMPLATE_GENERATION in lib/consent/template.ts\n' +
          '      (e.g. PRE_1 → PRE_2 + add PRE_2 constant)\n' +
          '   2. Add a new migration backfilling template_generation for the new text pattern\n' +
          '   3. Update EXPECTED_CONSENT_TEXT_HASH in this file to the new hash\n' +
          '   4. In PR body, explain the semantic scope change for legal review\n' +
          '\n' +
          '   See: docs/processing-service-plan.md §3.1 punkt 1\n'
        );
      }
      expect(canonicalHash).toBe(EXPECTED_CONSENT_TEXT_HASH);
    });

    it('CURRENT_CONSENT_TEMPLATE_GENERATION is defined and >= PRE_1', async () => {
      const { CURRENT_CONSENT_TEMPLATE_GENERATION, CONSENT_TEMPLATE_GENERATION } =
        await import('../consent/template');
      expect(CURRENT_CONSENT_TEMPLATE_GENERATION).toBeGreaterThanOrEqual(
        CONSENT_TEMPLATE_GENERATION.PRE_1,
      );
    });
  });
});
