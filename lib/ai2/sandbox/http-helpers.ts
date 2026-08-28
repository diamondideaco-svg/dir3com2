import { timingSafeEqual } from 'node:crypto';
import { SandboxError } from '@/lib/ai2/sandbox/service';

const MAX_TEXT_INPUT = 500;

export function normalizeString(value: unknown, maxLen = MAX_TEXT_INPUT) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export function isTrustedSandboxAutomation(internalToken: string, requestToken: string) {
  const a = Buffer.from(internalToken, 'utf8');
  const b = Buffer.from(requestToken, 'utf8');
  if (!internalToken || !requestToken || a.length !== b.length || a.length < 16) return false;
  return timingSafeEqual(a, b);
}

export function toClientErrorMessage(error: unknown) {
  if (error instanceof SandboxError) {
    if (error.code === 'SANDBOX_BLOCKED_IN_PRODUCTION') return 'Sandbox API is disabled in production.';
    if (error.code === 'SANDBOX_TARGET_UNVERIFIED') return 'Sandbox target configuration cannot be verified.';
    if (error.code === 'SANDBOX_PROJECT_REF_MISSING') return 'Sandbox target project is missing.';
    if (error.code === 'SANDBOX_PROJECT_REF_MISMATCH') return 'Sandbox target project is not allowed.';
    if (error.code === 'INVALID_DATE' || error.code === 'INVALID_RANGE' || error.code === 'INVALID_GUESTS') return 'Invalid booking input.';
    if (error.code === 'PRODUCT_NOT_FOUND' || error.code === 'BOOKING_NOT_FOUND') return 'Requested sandbox record was not found.';
    if (error.code === 'SANDBOX_DB_ERROR' || error.code === 'SUPABASE_ADMIN_UNAVAILABLE') return 'Sandbox backend is currently unavailable.';
    if (error.code.startsWith('UNAVAILABLE')) return 'Requested dates are unavailable.';
    return 'Sandbox operation failed.';
  }
  return 'Sandbox operation failed.';
}
