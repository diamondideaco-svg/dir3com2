const MARKETPLACE_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeMarketplaceIdentifier(value: string | null | undefined) {
  const normalized = decodeURIComponent((value ?? '').trim()).toLowerCase();

  if (!normalized || normalized.length > 120 || !MARKETPLACE_IDENTIFIER_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizePublicImageUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
