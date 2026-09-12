export const SABRE_CERT_ORIGIN = 'https://api.cert.platform.sabre.com';

/**
 * Sabre credentials are valid only against the official HTTPS certification
 * origin. Keep this check independent from provider-proof gating so every
 * Sabre call site (including the legacy informational route) is fail-closed.
 */
export function isSabreCertUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:'
      && url.hostname === 'api.cert.platform.sabre.com'
      && !url.port
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function resolveSabreCertUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  if (!isSabreCertUrl(candidate)) {
    throw new Error('Sabre certification endpoint is not allowed.');
  }
  return candidate;
}
