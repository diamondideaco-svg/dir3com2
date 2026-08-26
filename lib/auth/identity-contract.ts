export const CANONICAL_ROLES = ['customer', 'admin', 'partner', 'staff'] as const;

export type SessionRole = (typeof CANONICAL_ROLES)[number];
export type SessionIdentityState = 'authenticated' | 'anonymous_confirmed' | 'unresolved_or_error';

export interface SessionIdentity {
  identityState: SessionIdentityState;
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: SessionRole | null;
  roleRaw: string | null;
  status: string | null;
  isAdmin: boolean;
}

export function isSessionRole(value: unknown): value is SessionRole {
  return typeof value === 'string' && (CANONICAL_ROLES as readonly string[]).includes(value);
}

export function normalizeSessionRole(value: unknown): SessionRole | null {
  if (!isSessionRole(value)) {
    return null;
  }

  return value;
}

export function getRoleLabel(role: SessionRole | null, roleRaw?: string | null): string {
  if (role === 'admin') return 'admin';
  if (role === 'partner') return 'partner';
  if (role === 'staff') return 'staff';
  if (role === 'customer') return 'customer';

  const normalizedRawRole = roleRaw?.trim().toLowerCase() ?? '';
  if (normalizedRawRole) {
    return normalizedRawRole;
  }

  return 'unassigned';
}

export function createAnonymousSessionIdentity(): SessionIdentity {
  return {
    identityState: 'anonymous_confirmed',
    authenticated: false,
    userId: null,
    email: null,
    displayName: null,
    avatarUrl: null,
    role: null,
    roleRaw: null,
    status: null,
    isAdmin: false,
  };
}

export function createUnresolvedSessionIdentity(): SessionIdentity {
  return {
    ...createAnonymousSessionIdentity(),
    identityState: 'unresolved_or_error',
  };
}
