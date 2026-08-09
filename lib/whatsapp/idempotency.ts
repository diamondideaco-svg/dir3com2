import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

const DEFAULT_TTL_SECONDS = 60 * 15;
const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_RETRYABLE_DELAY_SECONDS = 30;
const DEFAULT_UNKNOWN_DELAY_SECONDS = 120;
const DEFAULT_MAX_ATTEMPTS = 3;

type DurableState = 'processing' | 'completed' | 'retryable_failed' | 'unknown_outcome' | 'permanent_failed';
type LeaseDecision =
  | 'acquired'
  | 'duplicate_processing'
  | 'duplicate_completed'
  | 'retry_wait'
  | 'unknown_wait'
  | 'permanent_failed'
  | 'retry_exhausted';

type MemoryRecord = {
  state: DurableState;
  expiresAt: number;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  retryAfter: number | null;
  attemptCount: number;
  outboundMessageId: string | null;
  lastErrorCode: string | null;
};

type IdempotencyRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

declare global {
  var __dir3comWhatsAppDedupeStore: Map<string, MemoryRecord> | undefined;
}

let idempotencyRpcClient: IdempotencyRpcClient | null = supabaseAdmin as unknown as IdempotencyRpcClient | null;
let nowProvider = () => Date.now();

function getStore() {
  if (!globalThis.__dir3comWhatsAppDedupeStore) {
    globalThis.__dir3comWhatsAppDedupeStore = new Map<string, MemoryRecord>();
  }
  return globalThis.__dir3comWhatsAppDedupeStore;
}

function ttlSeconds() {
  const parsed = Number(process.env.WHATSAPP_IDEMPOTENCY_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TTL_SECONDS;
}

function leaseSeconds() {
  const parsed = Number(process.env.WHATSAPP_IDEMPOTENCY_LEASE_SECONDS || DEFAULT_LEASE_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_LEASE_SECONDS;
}

function retryableDelaySeconds() {
  const parsed = Number(process.env.WHATSAPP_IDEMPOTENCY_RETRYABLE_DELAY_SECONDS || DEFAULT_RETRYABLE_DELAY_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RETRYABLE_DELAY_SECONDS;
}

function unknownDelaySeconds() {
  const parsed = Number(process.env.WHATSAPP_IDEMPOTENCY_UNKNOWN_DELAY_SECONDS || DEFAULT_UNKNOWN_DELAY_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_UNKNOWN_DELAY_SECONDS;
}

function maxAttempts() {
  const parsed = Number(process.env.WHATSAPP_IDEMPOTENCY_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_ATTEMPTS;
}

function nowMs() {
  return nowProvider();
}

function sweepExpired(now: number, store: Map<string, MemoryRecord>) {
  for (const [key, record] of store.entries()) {
    if (record.expiresAt <= now) {
      store.delete(key);
    }
  }
}

function requiresDurableIdempotency() {
  if (process.env.WHATSAPP_IDEMPOTENCY_REQUIRE_DURABLE === 'true') {
    return true;
  }

  return process.env.NODE_ENV === 'production';
}

function normalizeEventId(eventId: string) {
  return String(eventId || '').trim();
}

function makeLeaseOwner() {
  return crypto.randomUUID();
}

function makeRetryTimestamp(seconds: number) {
  return nowMs() + seconds * 1000;
}

function parseRpcLease(data: unknown) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  return {
    decision: String(record.decision || ''),
    state: String(record.state || ''),
    leaseOwner: String(record.lease_owner || ''),
    attemptCount: Number(record.attempt_count || 0),
  };
}

export function __setWhatsAppIdempotencyClientForTests(client: IdempotencyRpcClient | null) {
  idempotencyRpcClient = client ?? (supabaseAdmin as unknown as IdempotencyRpcClient | null);
}

export function __setWhatsAppIdempotencyNowForTests(provider: (() => number) | null) {
  nowProvider = provider ?? (() => Date.now());
}

export function isUsingMemoryIdempotencyStore() {
  return process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY === 'true' || !idempotencyRpcClient;
}

export type IdempotencyReservation = {
  isNew: boolean;
  deduplicated: boolean;
  decision: LeaseDecision;
  state: DurableState | 'memory';
  attemptCount: number;
  leaseOwner?: string;
  store: 'supabase' | 'memory';
  degraded: boolean;
  reason?: 'MISSING_SUPABASE_ADMIN' | 'SUPABASE_RPC_FAILED';
};

export type IdempotencyFailureState = 'retryable_failed' | 'unknown_outcome' | 'permanent_failed';

function acquireMemoryLease(eventId: string): IdempotencyReservation {
  const store = getStore();
  const now = nowMs();
  const ttl = ttlSeconds() * 1000;
  const lease = leaseSeconds() * 1000;
  const retryLimit = maxAttempts();

  sweepExpired(now, store);

  const existing = store.get(eventId);
  if (!existing) {
    const leaseOwner = makeLeaseOwner();
    store.set(eventId, {
      state: 'processing',
      expiresAt: now + ttl,
      leaseOwner,
      leaseExpiresAt: now + lease,
      retryAfter: null,
      attemptCount: 1,
      outboundMessageId: null,
      lastErrorCode: null,
    });
    return {
      isNew: true,
      deduplicated: false,
      decision: 'acquired',
      state: 'processing',
      attemptCount: 1,
      leaseOwner,
      store: 'memory',
      degraded: false,
    };
  }

  if (existing.state === 'completed') {
    return {
      isNew: false,
      deduplicated: true,
      decision: 'duplicate_completed',
      state: existing.state,
      attemptCount: existing.attemptCount,
      store: 'memory',
      degraded: false,
    };
  }

  if (existing.state === 'permanent_failed') {
    return {
      isNew: false,
      deduplicated: true,
      decision: 'permanent_failed',
      state: existing.state,
      attemptCount: existing.attemptCount,
      store: 'memory',
      degraded: false,
    };
  }

  if (existing.state === 'processing' && existing.leaseExpiresAt && existing.leaseExpiresAt > now) {
    return {
      isNew: false,
      deduplicated: true,
      decision: 'duplicate_processing',
      state: existing.state,
      attemptCount: existing.attemptCount,
      store: 'memory',
      degraded: false,
    };
  }

  if ((existing.state === 'retryable_failed' || existing.state === 'unknown_outcome') && existing.retryAfter && existing.retryAfter > now) {
    return {
      isNew: false,
      deduplicated: true,
      decision: existing.state === 'retryable_failed' ? 'retry_wait' : 'unknown_wait',
      state: existing.state,
      attemptCount: existing.attemptCount,
      store: 'memory',
      degraded: false,
    };
  }

  if (existing.attemptCount >= retryLimit) {
    return {
      isNew: false,
      deduplicated: true,
      decision: 'retry_exhausted',
      state: existing.state,
      attemptCount: existing.attemptCount,
      store: 'memory',
      degraded: false,
    };
  }

  const leaseOwner = makeLeaseOwner();
  const nextAttempt = existing.attemptCount + 1;
  store.set(eventId, {
    ...existing,
    state: 'processing',
    leaseOwner,
    leaseExpiresAt: now + lease,
    retryAfter: null,
    attemptCount: nextAttempt,
    lastErrorCode: null,
  });

  return {
    isNew: true,
    deduplicated: false,
    decision: 'acquired',
    state: 'processing',
    attemptCount: nextAttempt,
    leaseOwner,
    store: 'memory',
    degraded: false,
  };
}

function completeMemoryLease(eventId: string, leaseOwner: string, outboundMessageId: string) {
  const record = getStore().get(eventId);
  if (!record || record.leaseOwner !== leaseOwner || record.state !== 'processing') {
    return false;
  }

  record.state = 'completed';
  record.leaseOwner = null;
  record.leaseExpiresAt = null;
  record.retryAfter = null;
  record.outboundMessageId = outboundMessageId;
  record.lastErrorCode = null;
  record.expiresAt = nowMs() + ttlSeconds() * 1000;
  return true;
}

function failMemoryLease(eventId: string, leaseOwner: string, state: IdempotencyFailureState, errorCode?: string) {
  const record = getStore().get(eventId);
  if (!record || record.leaseOwner !== leaseOwner || record.state !== 'processing') {
    return false;
  }

  record.state = state;
  record.leaseOwner = null;
  record.leaseExpiresAt = null;
  record.lastErrorCode = errorCode || null;
  record.retryAfter =
    state === 'retryable_failed'
      ? makeRetryTimestamp(retryableDelaySeconds())
      : state === 'unknown_outcome'
        ? makeRetryTimestamp(unknownDelaySeconds())
        : null;
  record.expiresAt = nowMs() + ttlSeconds() * 1000;
  return true;
}

export async function acquireWebhookEventLease(eventId: string): Promise<IdempotencyReservation> {
  const normalized = normalizeEventId(eventId);
  if (!normalized) {
    return {
      isNew: false,
      deduplicated: true,
      decision: 'duplicate_completed',
      state: 'memory',
      attemptCount: 0,
      store: 'memory',
      degraded: false,
    };
  }

  const durableRequired = requiresDurableIdempotency();

  if (isUsingMemoryIdempotencyStore()) {
    if (durableRequired) {
      return {
        isNew: false,
        deduplicated: true,
        decision: 'retry_exhausted',
        state: 'memory',
        attemptCount: 0,
        store: 'memory',
        degraded: true,
        reason: 'MISSING_SUPABASE_ADMIN',
      };
    }

    return acquireMemoryLease(normalized);
  }

  try {
    const leaseOwner = makeLeaseOwner();
    const { data, error } = await idempotencyRpcClient!.rpc('acquire_whatsapp_event_lease', {
      p_event_key: normalized,
      p_lease_owner: leaseOwner,
      p_ttl_seconds: ttlSeconds(),
      p_lease_seconds: leaseSeconds(),
      p_max_attempts: maxAttempts(),
    });

    if (error) {
      if (durableRequired) {
        return {
          isNew: false,
          deduplicated: true,
          decision: 'retry_exhausted',
          state: 'processing',
          attemptCount: 0,
          store: 'supabase',
          degraded: true,
          reason: 'SUPABASE_RPC_FAILED',
        };
      }

      return acquireMemoryLease(normalized);
    }

    const parsed = parseRpcLease(data);
    if (!parsed) {
      if (durableRequired) {
        return {
          isNew: false,
          deduplicated: true,
          decision: 'retry_exhausted',
          state: 'processing',
          attemptCount: 0,
          store: 'supabase',
          degraded: true,
          reason: 'SUPABASE_RPC_FAILED',
        };
      }

      return acquireMemoryLease(normalized);
    }

    return {
      isNew: parsed.decision === 'acquired',
      deduplicated: parsed.decision !== 'acquired',
      decision: parsed.decision as LeaseDecision,
      state: parsed.state as DurableState,
      attemptCount: parsed.attemptCount,
      leaseOwner: parsed.leaseOwner || undefined,
      store: 'supabase',
      degraded: false,
    };
  } catch {
    if (durableRequired) {
      return {
        isNew: false,
        deduplicated: true,
        decision: 'retry_exhausted',
        state: 'processing',
        attemptCount: 0,
        store: 'supabase',
        degraded: true,
        reason: 'SUPABASE_RPC_FAILED',
      };
    }

    return acquireMemoryLease(normalized);
  }
}

export async function completeWebhookEventLease(eventId: string, leaseOwner: string, outboundMessageId: string) {
  const normalized = normalizeEventId(eventId);
  const normalizedLease = String(leaseOwner || '').trim();
  const normalizedOutboundId = String(outboundMessageId || '').trim();

  if (!normalized || !normalizedLease || !normalizedOutboundId) {
    return false;
  }

  if (isUsingMemoryIdempotencyStore()) {
    return completeMemoryLease(normalized, normalizedLease, normalizedOutboundId);
  }

  try {
    const { data, error } = await idempotencyRpcClient!.rpc('complete_whatsapp_event_lease', {
      p_event_key: normalized,
      p_lease_owner: normalizedLease,
      p_outbound_message_id: normalizedOutboundId,
      p_ttl_seconds: ttlSeconds(),
    });

    if (error) {
      return false;
    }

    return Boolean(data);
  } catch {
    return false;
  }
}

export async function markWebhookEventLeaseFailed(
  eventId: string,
  leaseOwner: string,
  state: IdempotencyFailureState,
  errorCode?: string,
) {
  const normalized = normalizeEventId(eventId);
  const normalizedLease = String(leaseOwner || '').trim();

  if (!normalized || !normalizedLease) {
    return false;
  }

  if (isUsingMemoryIdempotencyStore()) {
    return failMemoryLease(normalized, normalizedLease, state, errorCode);
  }

  try {
    const { data, error } = await idempotencyRpcClient!.rpc('fail_whatsapp_event_lease', {
      p_event_key: normalized,
      p_lease_owner: normalizedLease,
      p_failure_state: state,
      p_error_code: errorCode || null,
      p_ttl_seconds: ttlSeconds(),
      p_retry_after_seconds:
        state === 'retryable_failed'
          ? retryableDelaySeconds()
          : state === 'unknown_outcome'
            ? unknownDelaySeconds()
            : null,
    });

    if (error) {
      return false;
    }

    return Boolean(data);
  } catch {
    return false;
  }
}
