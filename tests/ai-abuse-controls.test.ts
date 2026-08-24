import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PublicAIAbuseGuard,
  estimatePublicAIUsageUnits,
  normalizePublicAIIdentity,
  type PublicAIAbuseConfig,
} from '@/lib/security/public-ai-abuse';

const testConfig: PublicAIAbuseConfig = {
  rateLimitMax: 2,
  rateLimitWindowMs: 100,
  quotaMax: 3,
  quotaWindowMs: 500,
  concurrencyMax: 1,
  usageBudgetMax: 6,
  usageBudgetWindowMs: 500,
  maxEntries: 2,
};

test('normal request is admitted and usage units are bounded', () => {
  const now = 0;
  const guard = new PublicAIAbuseGuard(testConfig, () => now);
  const admission = guard.acquire('203.0.113.10', estimatePublicAIUsageUnits(200, 1));

  assert.deepEqual(admission, { ok: true });
  assert.equal(guard.size, 1);
});

test('rate limit rejects after the configured short window budget', () => {
  let now = 0;
  const guard = new PublicAIAbuseGuard(testConfig, () => now);

  assert.deepEqual(guard.acquire('rate-user', 1), { ok: true });
  guard.release('rate-user');
  assert.deepEqual(guard.acquire('rate-user', 1), { ok: true });
  guard.release('rate-user');
  assert.deepEqual(guard.acquire('rate-user', 1), { ok: false, reason: 'rate-limit' });

  now = 101;
  assert.deepEqual(guard.acquire('rate-user', 1), { ok: true });
});

test('quota rejects after the longer window budget', () => {
  const now = 0;
  const guard = new PublicAIAbuseGuard({ ...testConfig, rateLimitMax: 10 }, () => now);

  for (let requestNumber = 0; requestNumber < 3; requestNumber += 1) {
    assert.deepEqual(guard.acquire('quota-user', 1), { ok: true });
    guard.release('quota-user');
  }
  assert.deepEqual(guard.acquire('quota-user', 1), { ok: false, reason: 'quota' });
});

test('concurrency rejects and release permits the next request', () => {
  const guard = new PublicAIAbuseGuard(testConfig, () => 0);

  assert.deepEqual(guard.acquire('concurrent-user', 1), { ok: true });
  assert.deepEqual(guard.acquire('concurrent-user', 1), { ok: false, reason: 'concurrency' });
  guard.release('concurrent-user');
  assert.deepEqual(guard.acquire('concurrent-user', 1), { ok: true });
});

test('usage budget rejects expensive requests without exposing identity', () => {
  const guard = new PublicAIAbuseGuard({ ...testConfig, rateLimitMax: 10, quotaMax: 10 }, () => 0);
  const identity = '198.51.100.12';

  assert.deepEqual(guard.acquire(identity, 6), { ok: true });
  guard.release(identity);
  const rejection = guard.acquire(identity, 1);

  assert.deepEqual(rejection, { ok: false, reason: 'usage-budget' });
  assert.equal(JSON.stringify(rejection).includes(identity), false);
  assert.equal(normalizePublicAIIdentity(identity).includes(identity), false);
});

test('stale entries expire and the map remains bounded', () => {
  let now = 0;
  const guard = new PublicAIAbuseGuard({ ...testConfig, maxEntries: 2 }, () => now);

  assert.deepEqual(guard.acquire('first-user', 1), { ok: true });
  guard.release('first-user');
  assert.deepEqual(guard.acquire('second-user', 1), { ok: true });
  guard.release('second-user');
  assert.equal(guard.size, 2);

  assert.deepEqual(guard.acquire('third-user', 1), { ok: true });
  guard.release('third-user');
  assert.equal(guard.size, 2);

  now = 501;
  assert.deepEqual(guard.acquire('fresh-user', 1), { ok: true });
  guard.release('fresh-user');
  assert.equal(guard.size, 1);
});
