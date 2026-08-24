import { createHash } from 'node:crypto';

export type PublicAIAbuseConfig = {
  rateLimitMax: number;
  rateLimitWindowMs: number;
  quotaMax: number;
  quotaWindowMs: number;
  concurrencyMax: number;
  usageBudgetMax: number;
  usageBudgetWindowMs: number;
  maxEntries: number;
};

type Entry = {
  rateWindowStartedAt: number;
  rateCount: number;
  quotaWindowStartedAt: number;
  quotaCount: number;
  usageWindowStartedAt: number;
  usageUnits: number;
  inFlight: number;
  lastSeenAt: number;
};

export type PublicAIAbuseRejection = 'rate-limit' | 'quota' | 'concurrency' | 'usage-budget';

const DEFAULT_CONFIG: PublicAIAbuseConfig = {
  rateLimitMax: 12,
  rateLimitWindowMs: 60_000,
  quotaMax: 120,
  quotaWindowMs: 24 * 60 * 60_000,
  concurrencyMax: 2,
  usageBudgetMax: 180,
  usageBudgetWindowMs: 24 * 60 * 60_000,
  maxEntries: 10_000,
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPublicAIAbuseConfig(env: Record<string, string | undefined> = process.env): PublicAIAbuseConfig {
  return {
    rateLimitMax: positiveInteger(env.DABRA_PUBLIC_AI_RATE_LIMIT_MAX, DEFAULT_CONFIG.rateLimitMax),
    rateLimitWindowMs: positiveInteger(env.DABRA_PUBLIC_AI_RATE_LIMIT_WINDOW_MS, DEFAULT_CONFIG.rateLimitWindowMs),
    quotaMax: positiveInteger(env.DABRA_PUBLIC_AI_QUOTA_MAX, DEFAULT_CONFIG.quotaMax),
    quotaWindowMs: positiveInteger(env.DABRA_PUBLIC_AI_QUOTA_WINDOW_MS, DEFAULT_CONFIG.quotaWindowMs),
    concurrencyMax: positiveInteger(env.DABRA_PUBLIC_AI_CONCURRENCY_MAX, DEFAULT_CONFIG.concurrencyMax),
    usageBudgetMax: positiveInteger(env.DABRA_PUBLIC_AI_USAGE_BUDGET_MAX, DEFAULT_CONFIG.usageBudgetMax),
    usageBudgetWindowMs: positiveInteger(env.DABRA_PUBLIC_AI_USAGE_BUDGET_WINDOW_MS, DEFAULT_CONFIG.usageBudgetWindowMs),
    maxEntries: positiveInteger(env.DABRA_PUBLIC_AI_MAX_ENTRIES, DEFAULT_CONFIG.maxEntries),
  };
}

export function normalizePublicAIIdentity(identity: string | undefined): string {
  const normalized = identity?.trim().toLowerCase().slice(0, 128) || 'anonymous';
  return createHash('sha256').update(normalized).digest('hex');
}

export function estimatePublicAIUsageUnits(messageLength: number, historyTurns: number): number {
  return Math.max(1, 1 + Math.ceil(messageLength / 1000) + Math.min(historyTurns, 8));
}

export class PublicAIAbuseGuard {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly config: PublicAIAbuseConfig = getPublicAIAbuseConfig(),
    private readonly now: () => number = Date.now,
  ) {}

  acquire(identity: string, usageUnits: number): { ok: true } | { ok: false; reason: PublicAIAbuseRejection } {
    const now = this.now();
    this.cleanup(now);
    const key = normalizePublicAIIdentity(identity);
    const entry = this.entries.get(key) ?? this.createEntry(now);
    this.rollWindows(entry, now);

    if (entry.inFlight >= this.config.concurrencyMax) return { ok: false, reason: 'concurrency' };
    if (entry.rateCount >= this.config.rateLimitMax) return { ok: false, reason: 'rate-limit' };
    if (entry.quotaCount >= this.config.quotaMax) return { ok: false, reason: 'quota' };
    if (entry.usageUnits + usageUnits > this.config.usageBudgetMax) return { ok: false, reason: 'usage-budget' };

    entry.rateCount += 1;
    entry.quotaCount += 1;
    entry.usageUnits += usageUnits;
    entry.inFlight += 1;
    entry.lastSeenAt = now;
    this.entries.set(key, entry);
    return { ok: true };
  }

  release(identity: string) {
    const key = normalizePublicAIIdentity(identity);
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.inFlight = Math.max(0, entry.inFlight - 1);
    entry.lastSeenAt = this.now();
  }

  get size() {
    return this.entries.size;
  }

  private createEntry(now: number): Entry {
    return {
      rateWindowStartedAt: now,
      rateCount: 0,
      quotaWindowStartedAt: now,
      quotaCount: 0,
      usageWindowStartedAt: now,
      usageUnits: 0,
      inFlight: 0,
      lastSeenAt: now,
    };
  }

  private rollWindows(entry: Entry, now: number) {
    if (now - entry.rateWindowStartedAt >= this.config.rateLimitWindowMs) {
      entry.rateWindowStartedAt = now;
      entry.rateCount = 0;
    }
    if (now - entry.quotaWindowStartedAt >= this.config.quotaWindowMs) {
      entry.quotaWindowStartedAt = now;
      entry.quotaCount = 0;
    }
    if (now - entry.usageWindowStartedAt >= this.config.usageBudgetWindowMs) {
      entry.usageWindowStartedAt = now;
      entry.usageUnits = 0;
    }
  }

  private cleanup(now: number) {
    const staleAfter = Math.max(this.config.rateLimitWindowMs, this.config.quotaWindowMs, this.config.usageBudgetWindowMs);
    for (const [key, entry] of this.entries) {
      if (entry.inFlight === 0 && now - entry.lastSeenAt >= staleAfter) this.entries.delete(key);
    }
    while (this.entries.size >= this.config.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}

// This guard is intentionally in-process; distributed enforcement needs approved shared infrastructure.
export const publicAIAbuseGuard = new PublicAIAbuseGuard();
