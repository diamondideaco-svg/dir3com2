export const BOOKING_IDENTIFIER_MAX_LENGTH = 64;

const BOOKING_IDENTIFIER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeBookingIdentifier(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized.length > BOOKING_IDENTIFIER_MAX_LENGTH || !BOOKING_IDENTIFIER_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function isValidBookingIdentifier(value: unknown) {
  return normalizeBookingIdentifier(value) !== null;
}