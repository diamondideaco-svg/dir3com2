export const CANONICAL_ROLES = ['customer', 'admin', 'partner', 'staff'] as const;

export type SessionRole = (typeof CANONICAL_ROLES)[number];

export interface SessionIdentity {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: SessionRole | null;
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

export function getRoleLabel(role: SessionRole | null): string {
  if (role === 'admin') return 'admin';
  if (role === 'partner') return 'partner';
  if (role === 'staff') return 'staff';
  if (role === 'customer') return 'customer';
  return 'unknown';
}

export function createAnonymousSessionIdentity(): SessionIdentity {
  return {
    authenticated: false,
    userId: null,
    email: null,
    displayName: null,
    avatarUrl: null,
    role: null,
    status: null,
    isAdmin: false,
  };
}
