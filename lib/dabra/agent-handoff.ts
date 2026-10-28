import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { runInternalAgent } from './agent';
import { parseGeneralTravelAdvice } from './agent-general-travel';
import { callInternalAgentProvider, internalAgentConfiguration } from '../ai2/runtime/agent-provider-dispatch';
import { preparePublicAgentDialogue, composePublicAgentDialogue, DEFAULT_AGENT_DIALOGUE_POLICY, type AgentDialoguePolicy } from './agent-dialogue';
import { selectQualifiedAgentCapability, type AgentCapabilityProfile, type CapabilityMeasurement, type QualifiedAgentDestination, type AgentProviderId } from './agent-capabilities';
import { AGENT_TOOLS, agentIntent, type AgentIntent, type AgentTaskScope, agentProductRole, type AgentTaskSpec, type AgentTaskAuthority, type AgentTaskState,
  type AgentTaskBlockReason, type AgentTaskEvidence, type AgentTaskConsumption, type AgentTaskAccounting } from './agent-contract';

type Entry = { spec: AgentTaskSpec; fingerprint: string; state: AgentTaskState; accounting: AgentTaskAccounting; destination: { kind: 'core' } | QualifiedAgentDestination; stop?: () => void };
export type TaskDecision = { kind: 'accepted'; taskId: string } | { kind: 'rejected'; reason: AgentTaskBlockReason };
export type TaskExecution<T> =
  | { kind: 'completed'; output: T; state: Extract<AgentTaskState, { kind: 'completed' }> }
  | { kind: 'stopped'; state: AgentTaskState };
export function agentArtifactDigest(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string' || serialized.length > 262144) throw new Error('invalid_artifact');
  return createHash('sha256').update(serialized).digest('hex');
}
function validUsage(u: AgentTaskConsumption) {
  return [u.attempts, u.inputTokens, u.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)
    && Number.isFinite(u.costUsd) && u.costUsd >= 0;
}
function validSpec(s: AgentTaskSpec, now: number) {
  return (AGENT_TOOLS.some(tool => tool === s.capability) || s.capability === 'intent.classify')
    && /^[a-zA-Z0-9_-]{1,100}$/.test(s.id) && /^[a-zA-Z0-9:_-]{1,128}$/.test(s.idempotencyKey)
    && /^[a-zA-Z0-9:_-]{1,100}$/.test(s.owner) && /^[a-f0-9]{64}$/.test(s.inputDigest)
    && agentProductRole(s.capability) === s.productRole && ['ar','en'].includes(s.language)
    && Number.isFinite(s.createdAtMs) && s.createdAtMs <= now
    && Number.isFinite(s.deadlineAtMs) && s.deadlineAtMs > now
    && s.deadlineAtMs > s.createdAtMs && s.deadlineAtMs - s.createdAtMs <= s.limits.maxElapsedMs
    && Number.isSafeInteger(s.limits.maxElapsedMs) && s.limits.maxElapsedMs > 0 && s.limits.maxElapsedMs <= 120000
    && Number.isSafeInteger(s.limits.maxAttempts) && s.limits.maxAttempts > 0 && s.limits.maxAttempts <= 2
    && validUsage({ attempts: 0, inputTokens: s.limits.maxInputTokens, outputTokens: s.limits.maxOutputTokens, costUsd: s.limits.maxCostUsd });
}
function allowed(s: AgentTaskSpec, actor: AgentTaskAuthority) {
  if (s.productRole === 'ceo' && (actor.kind !== 'operator' || actor.role !== 'ceo')) return false;
  if (s.scope.kind === 'public') {
    return !['operations','executive','my_requests'].includes(s.capability);
  }
  if (s.scope.kind === 'owner') {
    return actor.kind === 'customer' && /^[a-zA-Z0-9_-]{1,128}$/.test(actor.actorId) && actor.actorId === actor.ownerId
      && s.scope.actorId === actor.actorId && s.scope.ownerId === actor.ownerId
      && ['my_requests','support','call_center'].includes(s.capability);
  }
  return actor.kind === 'operator' && /^[a-zA-Z0-9_-]{1,128}$/.test(actor.actorId) && actor.country === 'EG' && s.scope.actorId === actor.actorId
    && s.scope.country === 'EG' && s.scope.grant === 'operations:read'
    && ['operations','executive','support','call_center'].includes(s.capability);
}
function namespace(a: AgentTaskAuthority) { return a.kind === 'guest' ? 'guest' : a.actorId; }
function frozenSpec(s: AgentTaskSpec): AgentTaskSpec {
  return Object.freeze({ ...s, scope: Object.freeze({ ...s.scope }), limits: Object.freeze({ ...s.limits }) });
}
function freezeState(state: AgentTaskState): AgentTaskState { return Object.freeze(state); }

/**
 * One coordinator owns atomic transitions within this instance only.
 * No persistence, cross-process deduplication or fleet spend guarantee is claimed.
 * Capacity fails closed; records are never silently evicted or reset to retry work.
 */
export class AgentTaskCoordinator {
  readonly guarantee = 'instance-local' as const;
  private readonly tasks = new Map<string, Entry>();
  private readonly keys = new Map<string, string>();
  constructor(private readonly options: { capacity?: number; now?: () => number } = {}) {}
  private now() { return (this.options.now ?? Date.now)(); }
  prepare(spec: AgentTaskSpec, actor: AgentTaskAuthority, destination: { kind: 'core' } | {
    kind: 'provider'; profiles: readonly AgentCapabilityProfile[]; environment: CapabilityMeasurement['environment'];
  } = { kind: 'core' }): TaskDecision {
    if (!validSpec(spec, this.now())) return { kind: 'rejected', reason: 'invalid_task' };
    if (!allowed(spec, actor)) return { kind: 'rejected', reason: 'forbidden' };
    let selected: { kind: 'core' } | QualifiedAgentDestination = { kind: 'core' };
    if (destination.kind === 'provider') {
      const selection = selectQualifiedAgentCapability(destination.profiles, { capability: spec.capability, language: spec.language,
        environment: destination.environment, nowMs: this.now(), limits: spec.limits });
      if (selection.kind === 'blocked') return { kind: 'rejected', reason: selection.reason };
      selected = selection.destination;
    } else if (spec.capability === 'intent.classify') return { kind: 'rejected', reason: 'unqualified' };
    const key = namespace(actor) + ':' + spec.idempotencyKey;
    // Request identity may change on a retry; semantic scope/owner/limits/deadline may not.
    const fingerprint = agentArtifactDigest({ ...spec, id: undefined });
    const existingId = this.keys.get(key);
    if (existingId) {
      const existing = this.tasks.get(existingId);
      return { kind: 'rejected', reason: existing?.fingerprint === fingerprint ? 'duplicate' : 'conflict' };
    }
    if (this.tasks.has(spec.id)) return { kind: 'rejected', reason: 'conflict' };
    const capacity = this.options.capacity ?? 64;
    if (!Number.isSafeInteger(capacity) || capacity < 1 || this.tasks.size >= capacity) return { kind: 'rejected', reason: 'capacity' };
    this.tasks.set(spec.id, { spec: frozenSpec(spec), fingerprint, destination: selected, accounting: this.accountingSnapshot(selected.kind, { attempts: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }), state: freezeState({ kind: 'prepared' }) });
    this.keys.set(key, spec.id);
    return { kind: 'accepted', taskId: spec.id };
  }
  private accountingSnapshot(kind: Entry['destination']['kind'], usage: AgentTaskConsumption): AgentTaskAccounting {
    const snapshot = Object.freeze({ ...usage });
    // A measured ceiling reserves budget; it is not actual provider consumption.
    return kind === 'core' ? Object.freeze({ kind: 'known', consumption: snapshot })
      : Object.freeze({ kind: 'reserved', upperBound: snapshot });
  }
  state(id: string): AgentTaskState | undefined { return this.tasks.get(id)?.state; }
  accounting(id: string): AgentTaskAccounting | undefined { return this.tasks.get(id)?.accounting; }
  acknowledge(id: string, owner: string): TaskDecision {
    const entry = this.tasks.get(id);
    if (!entry) return { kind: 'rejected', reason: 'invalid_task' };
    if (entry.spec.owner !== owner) return { kind: 'rejected', reason: 'wrong_owner' };
    if (entry.state.kind !== 'prepared') return { kind: 'rejected', reason: 'duplicate' };
    if (this.now() >= entry.spec.deadlineAtMs) { entry.state = freezeState({ kind: 'expired' }); return { kind: 'rejected', reason: 'expired' }; }
    const ack = Object.freeze({ taskId: id, owner, acknowledgedAtMs: this.now() });
    entry.state = freezeState({ kind: 'acknowledged', ack });
    return { kind: 'accepted', taskId: id };
  }
  cancel(id: string, owner: string): TaskDecision {
    const entry = this.tasks.get(id);
    if (!entry) return { kind: 'rejected', reason: 'invalid_task' };
    if (entry.spec.owner !== owner) return { kind: 'rejected', reason: 'wrong_owner' };
    if (['completed','failed','cancelled','expired'].includes(entry.state.kind)) return { kind: 'rejected', reason: 'duplicate' };
    entry.state = freezeState({ kind: 'cancelled' });
    entry.stop?.();
    return { kind: 'accepted', taskId: id };
  }
  async execute<T>(id: string, owner: string, options: {
    signal?: AbortSignal; isCurrent: () => boolean | Promise<boolean>;
    validateOutput: (output: unknown) => output is T;
    run: (context: { task: AgentTaskSpec; destination: Entry['destination']; signal: AbortSignal; reserve: (usage: AgentTaskConsumption) => void }) =>
      Promise<{ output: unknown; evidence: AgentTaskEvidence }>;
  }): Promise<TaskExecution<T>> {
    const entry = this.tasks.get(id);
    if (!entry) return { kind: 'stopped', state: { kind: 'blocked', reason: 'invalid_task' } };
    if (entry.spec.owner !== owner) return { kind: 'stopped', state: { kind: 'blocked', reason: 'wrong_owner' } };
    if (entry.state.kind !== 'acknowledged') return { kind: 'stopped', state: { kind: 'blocked', reason: 'not_acknowledged' } };
    const ack = entry.state.ack;
    entry.state = freezeState({ kind: 'running', ack }); // atomic claim before the first await
    const controller = new AbortController();
    let usage: AgentTaskConsumption = { attempts: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const stopped = new Promise<null>(resolve => {
      const abort = () => { if (entry.state.kind === 'running') entry.state = freezeState({ kind: 'cancelled' }); controller.abort(); resolve(null); };
      entry.stop = abort;
      abortListener = abort;
      if (options.signal?.aborted || this.state(id)?.kind === 'cancelled') abort();
      else options.signal?.addEventListener('abort', abort, { once: true });
      const remaining = entry.spec.deadlineAtMs - this.now();
      if (remaining <= 0) { if (entry.state.kind === 'running') entry.state = freezeState({ kind: 'expired' }); controller.abort(); resolve(null); }
      else if (!controller.signal.aborted) timeout = setTimeout(() => { if (entry.state.kind === 'running') entry.state = freezeState({ kind: 'expired' }); controller.abort(); resolve(null); }, remaining);
    });
    const stillRunning = () => {
      if (entry.state.kind === 'running' && this.now() >= entry.spec.deadlineAtMs) {
        entry.state = freezeState({ kind: 'expired' }); controller.abort();
      }
      return entry.state.kind === 'running' && !controller.signal.aborted;
    };
    const reserve = (next: AgentTaskConsumption) => {
      if (!stillRunning()) throw new Error('task_stopped');
      if (!validUsage(next) || next.attempts < 1) throw new Error('task_budget');
      const total = { attempts: usage.attempts + next.attempts, inputTokens: usage.inputTokens + next.inputTokens,
        outputTokens: usage.outputTokens + next.outputTokens, costUsd: usage.costUsd + next.costUsd };
      const limit = entry.spec.limits;
      if (total.attempts > limit.maxAttempts || total.inputTokens > limit.maxInputTokens
        || total.outputTokens > limit.maxOutputTokens || total.costUsd > limit.maxCostUsd) throw new Error('task_budget');
      usage = total;
      entry.accounting = this.accountingSnapshot(entry.destination.kind, total);
    };
    try {
      const work = (async () => {
        if (!stillRunning() || !(await options.isCurrent()) || !stillRunning()) return null;
        if (entry.destination.kind === 'provider') {
          const m = entry.destination.measurement;
          if (this.now() >= m.expiresAtMs) throw new Error('task_unqualified');
          reserve({ attempts: 1, inputTokens: m.inputTokenCeiling, outputTokens: m.outputTokenCeiling, costUsd: m.costCeilingUsd });
        }
        const result = await options.run({ task: entry.spec, destination: entry.destination, signal: controller.signal, reserve });
        if (!stillRunning() || !(await options.isCurrent()) || !stillRunning()) return null;
        return result;
      })();
      const result = await Promise.race([work, stopped]);
      if (!result) {
        if (entry.state.kind === 'running') entry.state = freezeState({ kind: 'blocked', reason: 'forbidden' });
        return { kind: 'stopped', state: entry.state };
      }
      const proof = result.evidence;
      const output = result.output;
      if (!options.validateOutput(output)) {
        if (stillRunning()) entry.state = freezeState({ kind: 'failed', reason: 'invalid_result' });
        return { kind: 'stopped', state: entry.state };
      }
      if (!stillRunning()) return { kind: 'stopped', state: entry.state };
      if (usage.attempts < 1
        || proof.taskId !== id || proof.owner !== owner || proof.inputDigest !== entry.spec.inputDigest
        || proof.outputDigest !== agentArtifactDigest(output)
        || proof.source !== (entry.destination.kind === 'core' ? 'dir3com-core' : 'qualified-adapter')) {
        entry.state = freezeState({ kind: 'failed', reason: 'invalid_result' });
        return { kind: 'stopped', state: entry.state };
      }
      if (!stillRunning()) return { kind: 'stopped', state: entry.state };
      const state = Object.freeze({ kind: 'completed' as const, ack, evidence: Object.freeze({ ...proof }),
        accounting: entry.accounting, completedAtMs: this.now() });
      entry.state = state;
      return { kind: 'completed', output, state };
    } catch (error) {
      if (entry.state.kind === 'running') entry.state = freezeState({ kind: 'failed',
        reason: error instanceof Error && error.message === 'task_budget' ? 'budget' : 'execution_failed' });
      return { kind: 'stopped', state: entry.state };
    } finally {
      entry.stop = undefined;
      if (timeout) clearTimeout(timeout);
      if (abortListener) options.signal?.removeEventListener('abort', abortListener);
      controller.abort();
    }
  }
}

type CoreInput = Parameters<typeof runInternalAgent>[0];
type CoreReply = Awaited<ReturnType<typeof runInternalAgent>>;
type DialogueReply = Omit<CoreReply, 'provider' | 'groundingStatus' | 'retrievalMode'> & {
  provider: AgentProviderId; groundingStatus: CoreReply['groundingStatus'] | 'answered-general';
  retrievalMode: CoreReply['retrievalMode'] | 'qualified-dialogue';
};
export type AgentCoreTaskResult =
  | { kind: 'response'; response: CoreReply | DialogueReply; task: AgentTaskState; dialogueTask?: AgentTaskState }
  | { kind: 'stopped'; task: AgentTaskState };
function privateTaskScope(intent: AgentIntent, actor: AgentTaskAuthority): AgentTaskScope | null {
  const privateRead = ['my_requests','operations','executive'].includes(intent.tool)
    || (intent.reference !== null && ['support','call_center'].includes(intent.tool));
  if (!privateRead) return { kind: 'public' };
  if (actor.kind === 'customer') return { kind: 'owner', actorId: actor.actorId, ownerId: actor.ownerId };
  if (actor.kind === 'operator' && actor.country === 'EG') return { kind: 'country', actorId: actor.actorId, country: 'EG', grant: 'operations:read' };
  return null;
}
function negativeReply(reply: CoreReply) { return ['authentication_required','forbidden','unavailable'].includes(reply.agent.state); }
/** Existing Core owns all facts/links/reads. This ledger is request-local, not a durable queue. */
export async function runInternalAgentTask(input: CoreInput, options: {
  signal?: AbortSignal; coordinator?: AgentTaskCoordinator; id?: string; idempotencyKey?: string; dialogue?: AgentDialoguePolicy;
} = {}): Promise<AgentCoreTaskResult> {
  const intent = input.intent ?? agentIntent(input.message);
  const actor = input.context.taskAuthority ?? { kind: 'guest' as const };
  const scope = privateTaskScope(intent, actor);
  const coordinator = options.coordinator ?? new AgentTaskCoordinator({ capacity: 2 });
  const id = options.id ?? randomUUID(); const now = Date.now();
  const deny = async (): Promise<AgentCoreTaskResult> => {
    const kind = input.context.taskAuthorityFailure ?? (input.context.role === 'guest' ? 'authentication_required' : 'forbidden');
    const response = await runInternalAgent({ ...input, intent, context: { ...input.context, readRequests: async () => ({ kind }) } });
    return { kind: 'response', response, task: { kind: 'blocked', reason: 'forbidden' } };
  };
  if (!scope) return deny();
  const spec: AgentTaskSpec = {
    id, idempotencyKey: options.idempotencyKey ?? id, owner: 'dabra-core', productRole: agentProductRole(intent.tool),
    capability: intent.tool, scope, language: input.locale,
    inputDigest: agentArtifactDigest({ message: input.message, history: input.history, intent, trip: input.trip ?? null }),
    createdAtMs: now, deadlineAtMs: now + 12000,
    limits: { maxAttempts: 1, maxElapsedMs: 12000, maxInputTokens: 0, maxOutputTokens: 0, maxCostUsd: 0 },
  };
  const prepared = coordinator.prepare(spec, actor);
  if (prepared.kind === 'rejected') {
    if (prepared.reason === 'forbidden') return deny();
    return { kind: 'stopped', task: { kind: 'blocked', reason: prepared.reason } };
  }
  const ack = coordinator.acknowledge(id, 'dabra-core');
  if (ack.kind === 'rejected') return { kind: 'stopped', task: { kind: 'blocked', reason: ack.reason } };
  let coreOutput: CoreReply | undefined;
  const result = await coordinator.execute(id, 'dabra-core', {
    signal: options.signal,
    isCurrent: () => scope.kind === 'public' || (input.context.isTaskAuthorityCurrent?.() ?? false),
    validateOutput: (value): value is CoreReply => coreOutput !== undefined && value === coreOutput
      && typeof coreOutput.answer === 'string' && coreOutput.answer.length > 0 && coreOutput.answer.length <= 64000
      && coreOutput.language === input.locale && coreOutput.agent.tool === intent.tool
      && coreOutput.agent.mutations === 0 && !negativeReply(coreOutput),
    run: async ({ task, signal, reserve }) => {
      reserve({ attempts: 1, inputTokens: 0, outputTokens: 0, costUsd: 0 });
      if (signal.aborted) throw new Error('task_stopped');
      coreOutput = await runInternalAgent({ ...input, intent });
      return { output: coreOutput, evidence: { taskId: task.id, owner: task.owner,
        inputDigest: task.inputDigest, outputDigest: agentArtifactDigest(coreOutput), source: 'dir3com-core' } };
    },
  });
  if (result.kind === 'completed') {
    const plan = await preparePublicAgentDialogue({ ...input, intent }, result.output,
      options.dialogue ?? DEFAULT_AGENT_DIALOGUE_POLICY, spec.deadlineAtMs, options.signal);
    if (!plan) return { kind: 'response', response: result.output, task: result.state };
    const config = internalAgentConfiguration(plan.profile.provider);
    if (!config || config.model !== plan.profile.measurement.model
      || createHash('sha256').update(config.apiKey).digest('hex') !== plan.credentialSha256) return { kind: 'response', response: result.output, task: result.state };
    const providerId = randomUUID(), owner = 'dabra-dialogue:' + plan.profile.provider;
    const providerSpec: AgentTaskSpec = {
      id: providerId, idempotencyKey: providerId, owner, productRole: 'concierge', capability: 'discover',
      scope: { kind: 'public' }, language: input.locale, inputDigest: agentArtifactDigest(plan.inputDigestValue),
      createdAtMs: Date.now(), deadlineAtMs: plan.deadlineAtMs, limits: plan.limits,
    };
    const prepared = coordinator.prepare(providerSpec, actor, {
      kind: 'provider', profiles: [plan.profile], environment: (options.dialogue ?? DEFAULT_AGENT_DIALOGUE_POLICY).environment,
    });
    if (prepared.kind === 'rejected') return { kind: 'response', response: result.output, task: result.state,
      dialogueTask: { kind: 'blocked', reason: prepared.reason } };
    const acknowledged = coordinator.acknowledge(providerId, owner);
    if (acknowledged.kind === 'rejected') return { kind: 'response', response: result.output, task: result.state,
      dialogueTask: { kind: 'blocked', reason: acknowledged.reason } };
    let composed: DialogueReply | undefined;
    const dialogue = await coordinator.execute(providerId, owner, {
      signal: options.signal, isCurrent: plan.isCurrent,
      validateOutput: (value): value is DialogueReply => composed !== undefined && value === composed,
      run: async ({ task, signal, destination }) => {
        if (destination.kind !== 'provider' || signal.aborted) throw new Error('task_stopped');
        const m = destination.measurement;
        const reply = await callInternalAgentProvider(destination.provider, config, plan.message, {
          prompt: plan.prompt, language: input.locale, timeoutMs: Math.max(1, task.deadlineAtMs - Date.now()),
          maxOutputTokens: m.outputTokenCeiling, signal,
        });
        if (reply.ok && reply.model === m.model && reply.citations.length === 0
          && Number.isSafeInteger(reply.inputTokens) && Number.isSafeInteger(reply.outputTokens)
          && reply.inputTokens! >= 0 && reply.outputTokens! >= 0) {
          if (reply.inputTokens! > m.inputTokenCeiling || reply.outputTokens! > m.outputTokenCeiling) throw new Error('task_budget');
          const answer = plan.mode === 'general-travel'
            ? parseGeneralTravelAdvice(reply.answer, input.locale)
            : composePublicAgentDialogue(reply.answer, plan.units, input.locale);
          if (answer) composed = plan.mode === 'general-travel'
            ? { ...result.output, answer: [answer, ...plan.requiredUnits].join('\n\n'), sources: plan.requiredUnits.length ? result.output.sources : [], groundingStatus: 'answered-general', retrievalMode: 'qualified-dialogue',
              provider: destination.provider, agent: { ...result.output.agent, state: 'general_guidance' } }
            : { ...result.output, answer, provider: destination.provider };
        }
        return { output: composed ?? null, evidence: { taskId: task.id, owner: task.owner,
          inputDigest: task.inputDigest, outputDigest: agentArtifactDigest(composed ?? null), source: 'qualified-adapter' } };
      },
    });
    if (options.signal?.aborted || !await input.context.isTaskAuthorityCurrent!()) return { kind: 'stopped', task: dialogue.state };
    if (dialogue.kind === 'completed') return { kind: 'response', response: dialogue.output, task: dialogue.state };
    return { kind: 'response', response: result.output, task: result.state, dialogueTask: dialogue.state };
  }
  if (coreOutput && negativeReply(coreOutput)) return { kind: 'response', response: coreOutput, task: result.state };
  return { kind: 'stopped', task: result.state };
}
