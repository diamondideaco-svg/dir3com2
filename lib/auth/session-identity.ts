import {
  createAnonymousSessionIdentity,
  createUnresolvedSessionIdentity,
  normalizeSessionRole,
  type SessionIdentity,
} from '@/lib/auth/identity-contract';

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSessionIdentityPayload(payload: unknown): SessionIdentity {
  if (!isRecord(payload)) {
    return createUnresolvedSessionIdentity();
  }

  const identityState = payload.identityState;
  if (identityState !== 'authenticated' && identityState !== 'anonymous_confirmed' && identityState !== 'unresolved_or_error') {
    return createUnresolvedSessionIdentity();
  }
  if (identityState === 'unresolved_or_error') return createUnresolvedSessionIdentity();
  if (identityState === 'anonymous_confirmed') {
    return payload.authenticated === false ? createAnonymousSessionIdentity() : createUnresolvedSessionIdentity();
  }
  const userId = pickString(payload.userId);
  if (payload.authenticated !== true || !userId) return createUnresolvedSessionIdentity();
  const role = normalizeSessionRole(payload.role);

  return {
    identityState,
    authenticated: true,
    userId,
    email: pickString(payload.email),
    displayName: pickString(payload.displayName),
    avatarUrl: pickString(payload.avatarUrl),
    role,
    roleRaw: pickString(payload.roleRaw),
    status: pickString(payload.status),
    isAdmin: role === 'admin',
  };
}
