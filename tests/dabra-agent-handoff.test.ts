import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentTaskCoordinator, agentArtifactDigest } from '../lib/dabra/agent-handoff';
import { AGENT_PROVIDER_IDS, type AgentCapabilityProfile } from '../lib/dabra/agent-capabilities';
import type { AgentTaskSpec, AgentTaskAuthority, AgentTaskConsumption, AgentTaskEvidence } from '../lib/dabra/agent-contract';
const actor: AgentTaskAuthority = { kind: 'customer', actorId: 'customer-a', ownerId: 'customer-a' };
function spec(overrides: Partial<AgentTaskSpec> = {}): AgentTaskSpec {
  const now = Date.now(); return { id: 'task-a', idempotencyKey: 'request-a', owner: 'worker-a',
    productRole: 'customer_service', capability: 'my_requests', scope: { kind: 'owner', actorId: 'customer-a', ownerId: 'customer-a' },
    language: 'ar', inputDigest: agentArtifactDigest({ purpose: 'synthetic state read' }), createdAtMs: now,
    deadlineAtMs: now + 1000, limits: { maxAttempts: 1, maxElapsedMs: 1000, maxInputTokens: 10, maxOutputTokens: 10, maxCostUsd: 0 }, ...overrides };
}
function validArtifact(value: unknown): value is { answer: string } {
  return value !== null && typeof value === 'object' && Object.keys(value).length === 1 && 'answer' in value && typeof value.answer === 'string';
}
function executor(options: { started?: () => void; wait?: Promise<void>; proof?: Partial<AgentTaskEvidence>; usage?: AgentTaskConsumption } = {}) {
  return async ({ task, reserve }: { task: AgentTaskSpec; reserve: (u: AgentTaskConsumption) => void }) => {
    reserve(options.usage ?? { attempts: 1, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    options.started?.(); await options.wait;
    const output = { answer: 'synthetic result' };
    return { output, evidence: { taskId: task.id, owner: task.owner, inputDigest: task.inputDigest,
      outputDigest: agentArtifactDigest(output), source: 'dir3com-core' as const, ...options.proof } };
  };
}
function accepted(c: AgentTaskCoordinator, s = spec()) {
  assert.equal(c.prepare(s, actor).kind, 'accepted');
  assert.equal(c.acknowledge(s.id, s.owner).kind, 'accepted'); return s;
}
test('Task217: ACK alone is not completion and a wrong owner cannot consume the task', async () => {
  const c = new AgentTaskCoordinator(); const s = spec(); assert.equal(c.prepare(s, actor).kind, 'accepted');
  let calls = 0;
  assert.equal((await c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact, run: async ctx => { calls++; return executor()(ctx); } })).kind, 'stopped');
  assert.deepEqual(c.acknowledge(s.id, 'intruder'), { kind: 'rejected', reason: 'wrong_owner' });
  c.acknowledge(s.id, s.owner); assert.equal(c.state(s.id)?.kind, 'acknowledged'); assert.equal(calls, 0);
});
test('Task217: concurrent executions have exactly one owner/attempt and associated evidence', async () => {
  const c = new AgentTaskCoordinator(); const s = accepted(c); const gate = Promise.withResolvers<void>(); const started = Promise.withResolvers<void>(); let calls = 0;
  const first = c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact,
    run: executor({ started: () => { calls++; started.resolve(); }, wait: gate.promise }) });
  await started.promise;
  const second = await c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact, run: executor({ started: () => calls++ }) });
  assert.equal(second.kind, 'stopped'); gate.resolve(); const result = await first; assert.equal(result.kind, 'completed'); assert.equal(calls, 1);
  if (result.kind === 'completed') { assert.equal(result.state.evidence.taskId, s.id); assert.equal(result.state.evidence.owner, s.owner); assert.equal(result.state.accounting.kind, 'known'); if (result.state.accounting.kind === 'known') assert.equal(result.state.accounting.consumption.attempts, 1); }
});
test('Task217: identical retries and conflicting reassignments cannot create a second task', () => {
  const c = new AgentTaskCoordinator(); const s = accepted(c);
  assert.deepEqual(c.prepare({ ...s, id: 'task-retry' }, actor), { kind: 'rejected', reason: 'duplicate' });
  assert.deepEqual(c.prepare({ ...s, id: 'task-other', owner: 'different-worker' }, actor), { kind: 'rejected', reason: 'conflict' });
});
test('Task217: cross-owner, wrong-country and elevated product-role requests fail before execution', () => {
  assert.deepEqual(new AgentTaskCoordinator().prepare(spec({ scope: { kind: 'owner', actorId: 'customer-a', ownerId: 'customer-b' } }), actor), { kind: 'rejected', reason: 'forbidden' });
  const operations = spec({ productRole: 'admin', capability: 'operations', scope: { kind: 'country', actorId: 'staff-a', country: 'EG', grant: 'operations:read' } });
  assert.equal(new AgentTaskCoordinator().prepare(operations, { kind: 'operator', actorId: 'staff-a', role: 'staff', country: null }).kind, 'rejected');
  const ceo = { ...operations, productRole: 'ceo' as const, capability: 'executive' as const };
  assert.equal(new AgentTaskCoordinator().prepare(ceo, { kind: 'operator', actorId: 'staff-a', role: 'admin', country: 'EG' }).kind, 'rejected');
});
for (const proof of [{ taskId: 'other-task' }, { owner: 'other-owner' }, { inputDigest: '0'.repeat(64) }, { outputDigest: '0'.repeat(64) }]) test('Task217: mismatched result evidence is not completion ' + Object.keys(proof)[0], async () => {
  const c = new AgentTaskCoordinator(); const s = accepted(c);
  const result = await c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact, run: executor({ proof }) });
  assert.equal(result.kind, 'stopped'); assert.equal(c.state(s.id)?.kind, 'failed');
});
for (const usage of [
  { attempts: 2, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  { attempts: 1, inputTokens: 11, outputTokens: 0, costUsd: 0 },
  { attempts: 1, inputTokens: 0, outputTokens: 11, costUsd: 0 },
  { attempts: 1, inputTokens: 0, outputTokens: 0, costUsd: 0.01 },
  { attempts: 1, inputTokens: 0, outputTokens: 0, costUsd: NaN },
]) test('Task217: exhausted/unknown consumption cannot reach the executor result ' + JSON.stringify(usage), async () => {
  const c = new AgentTaskCoordinator(); const s = accepted(c); let ran = false;
  const result = await c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact, run: executor({ usage, started: () => ran = true }) });
  assert.equal(result.kind, 'stopped'); assert.equal(ran, false); assert.deepEqual(c.state(s.id), { kind: 'failed', reason: 'budget' });
});
test('Task217: owner cancellation settles pending work and discards its late result', async () => {
  const c = new AgentTaskCoordinator(); const s = accepted(c); const gate = Promise.withResolvers<void>(); const started = Promise.withResolvers<void>();
  const pending = c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact, run: executor({ started: started.resolve, wait: gate.promise }) });
  await started.promise; assert.equal(c.cancel(s.id, s.owner).kind, 'accepted');
  const result = await pending; assert.equal(result.kind, 'stopped'); assert.equal(c.state(s.id)?.kind, 'cancelled');
  gate.resolve(); await Promise.resolve(); assert.equal(c.state(s.id)?.kind, 'cancelled');
});
test('Task217: external abort cancels without accepting a late result', async () => {
  const c = new AgentTaskCoordinator(); const s = accepted(c); const abort = new AbortController(); const gate = Promise.withResolvers<void>(); const started = Promise.withResolvers<void>();
  const pending = c.execute(s.id, s.owner, { signal: abort.signal, isCurrent: () => true, validateOutput: validArtifact, run: executor({ started: started.resolve, wait: gate.promise }) });
  await started.promise; abort.abort(); assert.equal((await pending).kind, 'stopped'); gate.resolve(); assert.equal(c.state(s.id)?.kind, 'cancelled');
});
test('Task217: deadline expiry during a pending result is terminal', async () => {
  const c = new AgentTaskCoordinator(); const s = accepted(c, spec({ deadlineAtMs: Date.now() + 25 }));
  const gate = Promise.withResolvers<void>();
  const result = await c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact, run: executor({ wait: gate.promise }) });
  assert.equal(result.kind, 'stopped'); assert.equal(c.state(s.id)?.kind, 'expired'); gate.resolve(); await Promise.resolve(); assert.equal(c.state(s.id)?.kind, 'expired');
});
test('Task217: revocation before and after execution prevents completed output', async () => {
  for (const revokeAfter of [false, true]) {
    const c = new AgentTaskCoordinator(); const s = accepted(c); let calls = 0;
    const result = await c.execute(s.id, s.owner, { isCurrent: () => { calls++; return revokeAfter && calls === 1; },
      validateOutput: validArtifact, run: executor() });
    assert.equal(result.kind, 'stopped'); assert.notEqual(c.state(s.id)?.kind, 'completed');
  }
});
test('Task217: completed evidence is immutable and cannot be expired by a later ACK', async () => {
  const task = spec(); let now = task.createdAtMs; const c = new AgentTaskCoordinator({ now: () => now }); const s = accepted(c, task);
  const result = await c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact, run: executor() }); assert.equal(result.kind, 'completed');
  now = s.deadlineAtMs + 1; c.acknowledge(s.id, s.owner); assert.equal(c.state(s.id)?.kind, 'completed');
  if (result.kind === 'completed') assert.equal(Reflect.set(result.state.evidence, 'owner', 'changed'), false);
});
test('Task217: capacity and qualification fail closed without pretending durable cross-instance locking', () => {
  const c = new AgentTaskCoordinator({ capacity: 1 }); const s = accepted(c);
  assert.equal(c.prepare(spec({ id: 'task-b', idempotencyKey: 'request-b' }), actor).kind, 'rejected');
  assert.equal(new AgentTaskCoordinator().prepare(s, actor).kind, 'accepted'); assert.equal(c.guarantee, 'instance-local');
  assert.deepEqual(new AgentTaskCoordinator().prepare(spec({ productRole: 'concierge', capability: 'intent.classify', scope: { kind: 'public' } }), actor),
    { kind: 'rejected', reason: 'unqualified' });
});


test('Task217: deadline crossed during validation is recorded as expired, not running', async () => {
  const task = spec(); let now = task.createdAtMs; const c = new AgentTaskCoordinator({ now: () => now }); const s = accepted(c, task);
  const result = await c.execute(s.id, s.owner, { isCurrent: () => true,
    validateOutput: (value): value is { answer: string } => { now = s.deadlineAtMs; return validArtifact(value); }, run: executor() });
  assert.equal(result.kind, 'stopped'); assert.equal(c.state(s.id)?.kind, 'expired');
});

test('Task217: cancellation during validation cannot be overwritten by invalid-result handling', async () => {
  const c = new AgentTaskCoordinator(); const s = accepted(c);
  const result = await c.execute(s.id, s.owner, { isCurrent: () => true,
    validateOutput: (value): value is { answer: string } => { assert.equal(validArtifact(value), true); c.cancel(s.id, s.owner); return false; }, run: executor() });
  assert.equal(result.kind, 'stopped'); assert.equal(c.state(s.id)?.kind, 'cancelled');
  assert.deepEqual(c.accounting(s.id), { kind: 'known', consumption: { attempts: 1, inputTokens: 0, outputTokens: 0, costUsd: 0 } });
});

function measuredProfiles(): AgentCapabilityProfile[] {
  const now = Date.now();
  return AGENT_PROVIDER_IDS.map(provider => ({ provider, measurement: {
    capability: 'intent.classify', language: 'ar', model: 'synthetic-measured-model', environment: 'synthetic',
    caseSetSha: 'a'.repeat(64), sourceSha: 'b'.repeat(40), cases: 5, passed: 5, measuredAtMs: now - 100,
    expiresAtMs: now + 10000, latencyMs: provider === 'qwen' ? 1 : 20,
    inputTokenCeiling: 2, outputTokenCeiling: 2, costCeilingUsd: 0.001,
  } }));
}
function classifierSpec() {
  return spec({ productRole: 'concierge', capability: 'intent.classify', scope: { kind: 'public' },
    limits: { maxAttempts: 1, maxElapsedMs: 1000, maxInputTokens: 10, maxOutputTokens: 10, maxCostUsd: 0.002 } });
}

test('Task217: one measured destination reserves its documented upper bound without claiming actual provider usage', async () => {
  const c = new AgentTaskCoordinator(); const s = classifierSpec(); let calls = 0;
  assert.equal(c.prepare(s, actor, { kind: 'provider', profiles: measuredProfiles(), environment: 'synthetic' }).kind, 'accepted');
  c.acknowledge(s.id, s.owner);
  const result = await c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact,
    run: async ({ task, destination }) => {
      calls++; assert.equal(destination.kind, 'provider');
      if (destination.kind === 'provider') assert.equal(destination.provider, 'qwen');
      const output = { answer: 'synthetic classified intent' };
      return { output, evidence: { taskId: task.id, owner: task.owner, inputDigest: task.inputDigest,
        outputDigest: agentArtifactDigest(output), source: 'qualified-adapter' } };
    } });
  assert.equal(result.kind, 'completed'); assert.equal(calls, 1);
  assert.deepEqual(c.accounting(s.id), { kind: 'reserved', upperBound: { attempts: 1, inputTokens: 2, outputTokens: 2, costUsd: 0.001 } });
  if (result.kind === 'completed') assert.equal(result.state.accounting.kind, 'reserved');
});

test('Task217: missing provider cost/token evidence cannot become a zero-cost attempt', () => {
  for (const field of ['costCeilingUsd', 'inputTokenCeiling', 'outputTokenCeiling']) {
    const profile = measuredProfiles()[0]; Reflect.deleteProperty(profile.measurement, field);
    const c = new AgentTaskCoordinator(); const s = classifierSpec();
    assert.deepEqual(c.prepare(s, actor, { kind: 'provider', profiles: [profile], environment: 'synthetic' }),
      { kind: 'rejected', reason: 'unqualified' });
    assert.equal(c.accounting(s.id), undefined);
  }
});

test('Task217: a cancelled provider task keeps its reserved upper bound and cannot be retried', async () => {
  const c = new AgentTaskCoordinator(); const s = classifierSpec(); const gate = Promise.withResolvers<void>(); const started = Promise.withResolvers<void>();
  c.prepare(s, actor, { kind: 'provider', profiles: measuredProfiles(), environment: 'synthetic' }); c.acknowledge(s.id, s.owner);
  const pending = c.execute(s.id, s.owner, { isCurrent: () => true, validateOutput: validArtifact,
    run: async ({ task }) => {
      started.resolve(); await gate.promise; const output = { answer: 'late synthetic output' };
      return { output, evidence: { taskId: task.id, owner: task.owner, inputDigest: task.inputDigest,
        outputDigest: agentArtifactDigest(output), source: 'qualified-adapter' } };
    } });
  await started.promise; c.cancel(s.id, s.owner); assert.equal((await pending).kind, 'stopped'); gate.resolve();
  assert.deepEqual(c.accounting(s.id), { kind: 'reserved', upperBound: { attempts: 1, inputTokens: 2, outputTokens: 2, costUsd: 0.001 } });
  assert.deepEqual(c.prepare({ ...s, id: 'retry-after-cancel' }, actor, { kind: 'provider', profiles: measuredProfiles(), environment: 'synthetic' }),
    { kind: 'rejected', reason: 'duplicate' });
});
