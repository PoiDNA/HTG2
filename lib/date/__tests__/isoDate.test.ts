import { describe, it, expect } from 'vitest';
import { normalizeDateInput } from '../isoDate';

describe('normalizeDateInput', () => {
  it('akceptuje ISO YYYY-MM-DD', () => {
    expect(normalizeDateInput('2026-04-01')).toBe('2026-04-01');
    expect(normalizeDateInput('2026-12-03')).toBe('2026-12-03');
  });

  it('akceptuje ISO z prefiksem czasowym', () => {
    expect(normalizeDateInput('2026-04-01T00:00:00')).toBe('2026-04-01');
    expect(normalizeDateInput('2026-04-01T23:59:59.999Z')).toBe('2026-04-01');
  });

  it('akceptuje polski format DD.MM.YYYY', () => {
    expect(normalizeDateInput('01.04.2026')).toBe('2026-04-01');
    expect(normalizeDateInput('29.04.2026')).toBe('2026-04-29');
  });

  it('odrzuca daty kalendarzowo niepoprawne', () => {
    expect(normalizeDateInput('2026-02-31')).toBeNull();
    expect(normalizeDateInput('2026-13-01')).toBeNull();
    expect(normalizeDateInput('2026-99-99')).toBeNull();
    expect(normalizeDateInput('99.99.2026')).toBeNull();
    expect(normalizeDateInput('31.02.2026')).toBeNull();
  });

  it('odrzuca śmieci i puste wartości', () => {
    expect(normalizeDateInput('')).toBeNull();
    expect(normalizeDateInput(null)).toBeNull();
    expect(normalizeDateInput(undefined)).toBeNull();
    expect(normalizeDateInput('foo')).toBeNull();
    expect(normalizeDateInput('2026/04/01')).toBeNull();
    expect(normalizeDateInput('1.4.2026')).toBeNull(); // wymaga zer wiodących
  });

  it('akceptuje rok przestępny dla 29 lutego', () => {
    expect(normalizeDateInput('2024-02-29')).toBe('2024-02-29');
    expect(normalizeDateInput('2025-02-29')).toBeNull();
  });
});
