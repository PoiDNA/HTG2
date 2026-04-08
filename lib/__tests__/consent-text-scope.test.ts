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
});
