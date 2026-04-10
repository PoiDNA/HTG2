/**
 * Unit tests dla canonical body serialization.
 *
 * Kluczowe właściwości testowane:
 * - Deterministic output dla tego samego input (sort keys rekurencyjnie)
 * - NFC Unicode normalization dla polskich diakrytyków
 * - Rejection dla float, undefined, Date, Map, Set, function, symbol
 * - BigInt → string preservation
 * - Array order preserved (semantic)
 * - Nested objects recursively canonicalized
 *
 * Contract test: fixture który Python worker musi serializować do
 * identycznych bajtów — jeśli ten hash się zmieni, worker też musi
 * zaktualizować swoją implementację. Pinned hash jako regression.
 */

import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalBody, parseAndCanonicalize } from '../canonical-body';

describe('canonicalize', () => {
  describe('primitives', () => {
    it('returns null for null', () => {
      expect(canonicalize(null)).toBe(null);
    });

    it('preserves booleans', () => {
      expect(canonicalize(true)).toBe(true);
      expect(canonicalize(false)).toBe(false);
    });

    it('preserves integers', () => {
      expect(canonicalize(0)).toBe(0);
      expect(canonicalize(42)).toBe(42);
      expect(canonicalize(-1)).toBe(-1);
      expect(canonicalize(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('rejects floats', () => {
      expect(() => canonicalize(3.14)).toThrow(/floats are forbidden/);
      expect(() => canonicalize(0.1)).toThrow(/floats are forbidden/);
    });

    it('rejects non-finite numbers', () => {
      expect(() => canonicalize(Infinity)).toThrow();
      expect(() => canonicalize(-Infinity)).toThrow();
      expect(() => canonicalize(NaN)).toThrow();
    });

    it('rejects undefined', () => {
      expect(() => canonicalize(undefined)).toThrow(/undefined is not JSON-serializable/);
    });

    it('rejects functions, symbols, dates, maps, sets', () => {
      expect(() => canonicalize(() => 0)).toThrow();
      expect(() => canonicalize(Symbol('x'))).toThrow();
      expect(() => canonicalize(new Date())).toThrow(/Date/);
      expect(() => canonicalize(new Map())).toThrow(/Map/);
      expect(() => canonicalize(new Set())).toThrow(/Set/);
    });

    it('converts bigint to string', () => {
      expect(canonicalize(BigInt(123))).toBe('123');
      expect(canonicalize(BigInt('9007199254740993'))).toBe('9007199254740993');
    });
  });

  describe('strings + NFC normalization', () => {
    it('preserves ASCII strings', () => {
      expect(canonicalize('hello')).toBe('hello');
      expect(canonicalize('')).toBe('');
    });

    it('normalizes Polish diacritics to NFC', () => {
      // "ą" can be composed (NFC U+0105) or decomposed (NFD U+0061 U+0328)
      const nfc = '\u0105';        // composed ą
      const nfd = 'a\u0328';        // decomposed a + combining ogonek
      expect(canonicalize(nfc)).toBe('\u0105');
      expect(canonicalize(nfd)).toBe('\u0105');  // NFD → NFC
    });

    it('preserves Polish sentences identically', () => {
      const polish = 'Zgoda na analizę sesji HTG: Wstęp, Sesja, Podsumowanie';
      expect(canonicalize(polish)).toBe(polish.normalize('NFC'));
    });
  });

  describe('objects with sorted keys', () => {
    it('sorts top-level keys alphabetically', () => {
      expect(canonicalize({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
    });

    it('sorts nested keys recursively', () => {
      const input = { z: { y: 1, x: 2 }, a: { c: 3, b: 4 } };
      const result = canonicalize(input) as Record<string, Record<string, number>>;
      expect(Object.keys(result)).toEqual(['a', 'z']);
      expect(Object.keys(result.a)).toEqual(['b', 'c']);
      expect(Object.keys(result.z)).toEqual(['x', 'y']);
    });

    it('handles empty object', () => {
      expect(canonicalize({})).toEqual({});
    });
  });

  describe('arrays preserve order', () => {
    it('does not sort array elements', () => {
      expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
    });

    it('canonicalizes array elements recursively', () => {
      const input = [{ b: 1, a: 2 }, { d: 3, c: 4 }];
      const result = canonicalize(input) as Array<Record<string, number>>;
      expect(Object.keys(result[0])).toEqual(['a', 'b']);
      expect(Object.keys(result[1])).toEqual(['c', 'd']);
    });

    it('handles empty array', () => {
      expect(canonicalize([])).toEqual([]);
    });
  });

  describe('nested complex structures', () => {
    it('preserves UUIDs as strings', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(canonicalize({ user_id: uuid })).toEqual({ user_id: uuid });
    });

    it('handles typical export dossier request', () => {
      const input = {
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        booking_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        require_sensitive: true,
      };
      const result = canonicalize(input) as Record<string, unknown>;
      expect(Object.keys(result)).toEqual(['booking_id', 'require_sensitive', 'user_id']);
    });
  });
});

describe('canonicalBody', () => {
  it('produces compact JSON bytes', () => {
    const bytes = canonicalBody({ a: 1, b: 2 });
    expect(bytes.toString('utf-8')).toBe('{"a":1,"b":2}');
  });

  it('has no whitespace', () => {
    const bytes = canonicalBody({ nested: { a: 1, b: [2, 3] } });
    const str = bytes.toString('utf-8');
    expect(str).not.toMatch(/\s/);
  });

  it('handles Polish diacritics as UTF-8', () => {
    // NFC composed
    const bytes = canonicalBody({ text: 'Wstęp' });
    // W=87 s=115 t=116 ę(NFC U+0119 = 0xC4 0x99 UTF-8) p=112
    const str = bytes.toString('utf-8');
    expect(str).toBe('{"text":"Wstęp"}');
    // Bytes should equal the NFC encoding
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe('parseAndCanonicalize', () => {
  it('accepts raw JSON string and canonicalizes', () => {
    // Input has unsorted keys + whitespace
    const raw = '{ "b": 1, "a": 2 }';
    const canonical = parseAndCanonicalize(raw);
    expect(canonical.toString('utf-8')).toBe('{"a":2,"b":1}');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseAndCanonicalize('{invalid}')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// CONTRACT TEST — stabilność między JS/Python implementation
// ═══════════════════════════════════════════════════════════════
//
// Ten hash MUSI być identyczny w Python worker implementation.
// Jeśli zmieniasz canonicalize() lub canonicalBody(), MUSISZ też
// zaktualizować Python stronę i pinned hash w obu miejscach.
//
// Fixture zawiera reprezentatywny request z:
// - Polish NFC diacritics (Wstęp, Podsumowanie)
// - UUID jako string
// - Integer (nie float)
// - Boolean
// - Nested object (Dossier subject)
// - Array z sorted elements
// - Null value
//
// Patrz: docs/processing-service-plan.md §2.1 (contract test)
// ═══════════════════════════════════════════════════════════════

describe('contract test — cross-runtime stability', () => {
  const fixture = {
    processing_run_id: '550e8400-e29b-41d4-a716-446655440000',
    attempt_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    advisory_type: 'mapa_uwarunkowan',
    subject_user_id: '11111111-2222-3333-4444-555555555555',
    version: 1,
    payload: {
      layers: ['fizyczna', 'percepcyjna', 'duchowa'],
      claims: [
        { text: 'Wstęp do sesji', citations: [], tags: ['tag-1'] },
      ],
      narrative_text: 'Podsumowanie analizy',
    },
    require_sensitive: true,
    some_null_field: null,
  };

  it('produces deterministic UTF-8 bytes', () => {
    const bytes1 = canonicalBody(fixture);
    const bytes2 = canonicalBody(fixture);
    expect(bytes1.equals(bytes2)).toBe(true);
  });

  it('hash matches pinned value (cross-runtime contract)', () => {
    const bytes = canonicalBody(fixture);
    const hash = createHash('sha256').update(bytes).digest('hex');
    // Pin tego hashu. Jeśli ten test fail, to KONIECZNIE
    // aktualizuj Python stronę workera przed merge.
    expect(hash).toBe('c09d44c465ab3242c9b72bc8e300815367fb9d95b3a5af1807d8d5faaf4da7ea');
  });
});
