/**
 * Canonical body serialization dla HMAC signing processing service requests.
 *
 * Wzorzec (plan §2.1):
 * - UTF-8 bytes po JSON.stringify z alfabetycznym sortowaniem kluczy (rekursywnie)
 * - Bez whitespace (separators zero)
 * - NFC Unicode normalization dla wszystkich stringów
 * - Zakaz float — tylko integer, string, bool, null, array, object
 * - UUID jako string (nie bigint — JS precision loss dla > 2^53)
 *
 * Cel: identyczne bajty między Python (worker) i TypeScript (HTG2) dla
 * tego samego logicznego payloadu. Contract test na polskich diakrytykach
 * NFC zapewnia stabilność między runtimes.
 *
 * Patrz: docs/processing-service-plan.md §2.1 (canonical body spec v8)
 */

/**
 * Recursively canonicalize a value dla HMAC signing.
 *
 * Rules:
 * - object: sorted keys, recursive canonicalize values
 * - array: kolejność zachowana (semantyczna), recursive canonicalize
 * - string: NFC normalize
 * - number: tylko integer — float rzuca błąd
 * - boolean / null: bez zmian
 * - undefined: rzuca błąd (JSON nie ma undefined)
 * - bigint: string representation (zachowuje pełną precyzję)
 *
 * @throws Error dla float, undefined, function, symbol, Date, Map, Set
 */
export function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (value === undefined) {
    throw new Error('canonicalize: undefined is not JSON-serializable');
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFC');
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`canonicalize: floats are forbidden in signed bodies (got ${value})`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalize: non-finite number (${value})`);
    }
    return value;
  }
  if (typeof value === 'bigint') {
    // BigInt → string to preserve precision across JS/Python
    return value.toString();
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`canonicalize: ${typeof value} is not serializable`);
  }
  if (value instanceof Date || value instanceof Map || value instanceof Set) {
    throw new Error(`canonicalize: ${value.constructor.name} not supported (use ISO string/plain object/array)`);
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  throw new Error(`canonicalize: unsupported type ${typeof value}`);
}

/**
 * Serialize canonicalized value to UTF-8 bytes bez whitespace.
 * Separators (',', ':') — compact output.
 *
 * Zwraca Buffer dla crypto HMAC operations.
 */
export function canonicalBody(value: unknown): Buffer {
  const canonical = canonicalize(value);
  // JSON.stringify z sort_keys przez canonicalize wyżej,
  // separators zero whitespace
  const jsonString = JSON.stringify(canonical);
  if (jsonString === undefined) {
    throw new Error('canonicalBody: value serialized to undefined (empty top-level)');
  }
  return Buffer.from(jsonString, 'utf-8');
}

/**
 * Parse + re-canonicalize raw request body string.
 * Używane po stronie recipient żeby zweryfikować że caller wysłał
 * canonical body (nie niecanonical) — inaczej HMAC nie zadziała.
 *
 * @throws Error jeśli input nie jest valid JSON lub zawiera forbidden types
 */
export function parseAndCanonicalize(rawBody: string): Buffer {
  const parsed = JSON.parse(rawBody);
  return canonicalBody(parsed);
}
