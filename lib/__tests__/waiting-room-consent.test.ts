// Regression test: WaitingRoom must pass bookingId to PreJoinCheck.
//
// PreJoinCheck only renders the consent checkbox when bookingId is truthy
// (see line "{allTested && bookingId && (" in PreJoinCheck.tsx). Without it,
// the consent UI is hidden and no consent is ever collected — which means:
//   - analytics pipeline never gets the second consent for para sessions
//   - legacy session_publications flow never starts sesja egress
//
// Additionally, PreJoinCheck must fail-closed on consent POST errors:
// if the network request fails or returns non-2xx, DO NOT call onReady().
// Previously the error was silently swallowed (console.warn only) and the
// user proceeded without consent being recorded — RODO violation.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');

function readFile(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf-8');
}

describe('WaitingRoom → PreJoinCheck props', () => {
  it('passes bookingId prop to PreJoinCheck', () => {
    const content = readFile('components/live/WaitingRoom.tsx');
    // Must contain an invocation of PreJoinCheck with bookingId prop
    expect(content).toMatch(/<PreJoinCheck[^>]*bookingId=\{bookingId\}/);
  });
});

describe('PreJoinCheck consent POST handling', () => {
  const content = readFile('components/live/PreJoinCheck.tsx');

  it('checks res.ok after consent fetch', () => {
    expect(content).toMatch(/if\s*\(\s*!res\.ok/);
  });

  it('sets consentError state on failure', () => {
    expect(content).toContain('setConsentError');
  });

  it('does not call onReady() if consent POST failed (early return)', () => {
    // The failure branches must include `return;` before the onReady() call.
    // We check that the text "setConsentError" is followed by "return;" somewhere
    // in the file (two branches: !res.ok and catch).
    const matches = content.match(/setConsentError[\s\S]{0,300}?return;/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('renders the consentError UI', () => {
    expect(content).toContain('{consentError && (');
  });
});
