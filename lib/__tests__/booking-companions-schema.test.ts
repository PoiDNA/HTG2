// Regression test: booking_companions schema assertion
//
// The booking_companions table uses `accepted_at TIMESTAMPTZ` (migration 020),
// NOT a `status` column. Two route handlers previously used
// `.eq('status', 'accepted')` which silently matched zero rows because the
// column doesn't exist. That blocked partners from:
// - submitting consent (IDOR check rejected them)
// - being counted in retry-recording's required consent count
//
// This test asserts that no server-side code uses the wrong column name
// against booking_companions. If a future refactor reintroduces the bug,
// CI will catch it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');

const FILES_THAT_QUERY_COMPANIONS = [
  'app/api/live/consent/route.ts',
  'app/api/live/retry-recording/route.ts',
  'app/api/live/token/route.ts',
];

describe('booking_companions query schema', () => {
  for (const relPath of FILES_THAT_QUERY_COMPANIONS) {
    it(`${relPath} does not use .eq('status', 'accepted')`, () => {
      const content = readFileSync(join(REPO_ROOT, relPath), 'utf-8');
      // The file must not contain this regression pattern anywhere near a
      // booking_companions query. We look for the literal substring.
      const hasBadPattern = /\.eq\(['"]status['"],\s*['"]accepted['"]\)/.test(content);
      expect(hasBadPattern).toBe(false);
    });

    it(`${relPath} queries booking_companions by accepted_at (not status)`, () => {
      const content = readFileSync(join(REPO_ROOT, relPath), 'utf-8');
      // If the file touches booking_companions, it must check accepted_at
      if (content.includes('booking_companions')) {
        const usesAcceptedAt =
          content.includes("'accepted_at'") || content.includes('"accepted_at"');
        expect(usesAcceptedAt).toBe(true);
      }
    });
  }
});
