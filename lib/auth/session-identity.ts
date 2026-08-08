import {
  createAnonymousSessionIdentity,
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
    return createAnonymousSessionIdentity();
  }

  const authenticated = payload.authenticated === true;
  const role = normalizeSessionRole(payload.role);

  return {
    authenticated,
    userId: pickString(payload.userId),
    email: pickString(payload.email),
    displayName: pickString(payload.displayName),
    avatarUrl: pickString(payload.avatarUrl),
    role,
    roleRaw: pickString(payload.roleRaw),
    status: pickString(payload.status),
    isAdmin: role === 'admin',
  };
}
