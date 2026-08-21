const DEFAULT_POST_LOGIN_PATH = '/';

export type TrustedSessionIdentity = {
  authenticated?: boolean;
  role?: string | null;
  roleRaw?: string | null;
};

export function getRolePostLoginDestination(identity: TrustedSessionIdentity) {
  const rawRole = identity.roleRaw?.trim().toLowerCase();
  const canonicalRole = identity.role?.trim().toLowerCase();

  if (canonicalRole === 'admin' || rawRole === 'admin' || rawRole === 'super_admin') {
    return '/admin';
  }

  if (rawRole === 'provider' || rawRole === 'service_provider' || rawRole === 'supplier') {
    return '/provider-portal';
  }

  if (canonicalRole === 'partner' || rawRole === 'partner') {
    return '/partner-portal';
  }

  return '/my-account';
}

/**
 * Keeps post-login navigation within this application and prevents the booking
 * form from being opened without the product it requires.
 */
export function getPostLoginDestination(value: string | null, origin?: string) {
  if (!value) return DEFAULT_POST_LOGIN_PATH;

  try {
    const baseOrigin = origin || 'http://local.invalid';
    const destination = new URL(value, baseOrigin);

    if (origin && destination.origin !== origin) return DEFAULT_POST_LOGIN_PATH;
    if (!origin && /^[a-z][a-z0-9+.-]*:/i.test(value)) return DEFAULT_POST_LOGIN_PATH;
    if (destination.pathname === '/booking' && !destination.searchParams.get('product')) {
      return DEFAULT_POST_LOGIN_PATH;
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return DEFAULT_POST_LOGIN_PATH;
  }
}
