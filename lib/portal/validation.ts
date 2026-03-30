// ============================================================
// Portal Messaging — Input validation helpers
// ============================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CHANNELS = ['all', 'email', 'portal', 'sms', 'internal'] as const;

export function validateUUID(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) return null;
  return value;
}

export function validateSubject(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 100) return null;
  return trimmed;
}

export function validateBodyText(value: unknown, maxLen = 2000): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > maxLen) return null;
  return trimmed;
}

export function validateChannel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!(VALID_CHANNELS as readonly string[]).includes(value)) return null;
  return value;
}
