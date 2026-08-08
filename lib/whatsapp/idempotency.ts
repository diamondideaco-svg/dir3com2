import { supabaseAdmin } from '@/lib/supabase/server';

const DEFAULT_TTL_SECONDS = 60 * 15;

type MemoryStore = Map<string, number>;

declare global {
  var __dir3comWhatsAppDedupeStore: MemoryStore | undefined;
}

function getStore(): MemoryStore {
  if (!globalThis.__dir3comWhatsAppDedupeStore) {
    globalThis.__dir3comWhatsAppDedupeStore = new Map<string, number>();
  }
  return globalThis.__dir3comWhatsAppDedupeStore;
}

function ttlMs() {
  const parsed = Number(process.env.WHATSAPP_IDEMPOTENCY_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
  return seconds * 1000;
}

function ttlSeconds() {
  const parsed = Number(process.env.WHATSAPP_IDEMPOTENCY_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TTL_SECONDS;
}

function sweepExpired(now: number, store: MemoryStore) {
  for (const [key, expiry] of store.entries()) {
    if (expiry <= now) {
      store.delete(key);
    }
  }
}

export function markWebhookEventIfNew(eventId: string): boolean {
  const normalized = String(eventId || '').trim();
  if (!normalized) return false;

  const store = getStore();
  const now = Date.now();
  sweepExpired(now, store);

  if (store.has(normalized)) {
    return false;
  }

  store.set(normalized, now + ttlMs());
  return true;
}

export function isUsingMemoryIdempotencyStore() {
  return process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY === 'true' || !supabaseAdmin;
}

function requiresDurableIdempotency() {
  if (process.env.WHATSAPP_IDEMPOTENCY_REQUIRE_DURABLE === 'true') {
    return true;
  }

  return process.env.NODE_ENV === 'production';
}

export type IdempotencyReservation = {
  isNew: boolean;
  store: 'supabase' | 'memory';
  degraded: boolean;
  reason?: 'MISSING_SUPABASE_ADMIN' | 'SUPABASE_RPC_FAILED';
};

export async function reserveWebhookEventIfNew(eventId: string): Promise<IdempotencyReservation> {
  const normalized = String(eventId || '').trim();
  if (!normalized) {
    return { isNew: false, store: 'memory', degraded: false };
  }

  const durableRequired = requiresDurableIdempotency();

  if (isUsingMemoryIdempotencyStore()) {
    if (durableRequired) {
      return {
        isNew: false,
        store: 'memory',
        degraded: true,
        reason: 'MISSING_SUPABASE_ADMIN',
      };
    }

    return {
      isNew: markWebhookEventIfNew(normalized),
      store: 'memory',
      degraded: false,
    };
  }

  try {
    const { data, error } = await supabaseAdmin!.rpc('reserve_whatsapp_event', {
      p_event_key: normalized,
      p_ttl_seconds: ttlSeconds(),
    });

    if (error) {
      if (durableRequired) {
        return {
          isNew: false,
          store: 'supabase',
          degraded: true,
          reason: 'SUPABASE_RPC_FAILED',
        };
      }

      return {
        isNew: markWebhookEventIfNew(normalized),
        store: 'memory',
        degraded: false,
      };
    }

    return {
      isNew: Boolean(data),
      store: 'supabase',
      degraded: false,
    };
  } catch {
    if (durableRequired) {
      return {
        isNew: false,
        store: 'supabase',
        degraded: true,
        reason: 'SUPABASE_RPC_FAILED',
      };
    }

    return {
      isNew: markWebhookEventIfNew(normalized),
      store: 'memory',
      degraded: false,
    };
  }
}
