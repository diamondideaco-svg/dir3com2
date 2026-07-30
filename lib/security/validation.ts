const SAFE_TEXT_MAX_LENGTH = 200;
const SAFE_MESSAGE_MAX_LENGTH = 2000;

export function sanitizeText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, SAFE_TEXT_MAX_LENGTH);
}

export function sanitizeMessage(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, SAFE_MESSAGE_MAX_LENGTH);
}

export function sanitizeNumber(value: unknown, fallback = 0): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return numericValue;
}

export function sanitizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  return fallback;
}

export function isSafePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return value.length > 0 && !value.includes('\0') && !value.includes('..');
}
