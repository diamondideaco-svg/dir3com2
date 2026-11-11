import 'server-only';
import { createHash } from 'node:crypto';
import { AGENT_PROVIDER_IDS, type AgentProviderId } from './agent-capabilities';
import type { DialogueDailyLimits } from './agent-dialogue';
import type { QualificationAccountChargeProof } from './dialogue-qualification';

// Design ceilings, not an issued approval. The stored authority defaults to NULL.
// Neither importing this module nor installing its migration grants spending.
export const BILINGUAL_QUALIFICATION = Object.freeze({
  schema: 'task217-bilingual-qualification-authority-v1' as const,
  additionalAttempts: 56, attemptsPerProvider: 8,
  maxCostMicros: 1000000, attemptCostMicros: 18432,
  runTimeoutMs: 120000,
});
export const BILINGUAL_QUALIFICATION_DAILY: DialogueDailyLimits = Object.freeze({
  uniqueUsers: 1, requestsPerUser: 56, requestsTotal: 56,
  inputTokensPerUser: 229376, outputTokensPerUser: 57344,
  inputTokensTotal: 229376, outputTokensTotal: 57344,
});
export type BilingualQualificationAuthority = Readonly<{
  schema: typeof BILINGUAL_QUALIFICATION.schema; enabled: true;
  authorizationId: string; approvalEvidenceSha256: string;
  sourceSha: string; subjectHash: string; authorizedAtMs: number; expiresAtMs: number;
  baseline: Readonly<{
    ledgerSha256: string; attempts: number; heldCostMicros: number;
    providerAttempts: Readonly<Record<AgentProviderId, number>>;
  }>;
  maxAttempts: number; maxCostMicros: number; maxAttemptCostMicros: number;
  dailyLimits: DialogueDailyLimits; runTimeoutMs: number;
  plans: readonly Readonly<{provider: AgentProviderId; grantId: string; planId: string; factsSha256: string}>[];
  bindingSha256: string;
}>;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function validBilingualQualificationDaily(v: unknown): v is DialogueDailyLimits {
  return record(v) && exact(v, Object.keys(BILINGUAL_QUALIFICATION_DAILY))
    && Object.entries(BILINGUAL_QUALIFICATION_DAILY).every(([k, value]) => v[k] === value);
}

/** Fixed ordered tuple also used by SQL. enabled is excluded only to allow terminal revocation. */
export function bilingualQualificationBindingSha256(a: BilingualQualificationAuthority): string {
  const b = a.baseline, d = a.dailyLimits;
  return hash([a.schema, a.authorizationId, a.approvalEvidenceSha256, a.sourceSha, a.subjectHash,
    a.authorizedAtMs, a.expiresAtMs, b.ledgerSha256, b.attempts, b.heldCostMicros,
    AGENT_PROVIDER_IDS.map(p => [p, b.providerAttempts[p]]), a.maxAttempts, a.maxCostMicros, a.maxAttemptCostMicros,
    [d.uniqueUsers, d.requestsPerUser, d.requestsTotal, d.inputTokensPerUser, d.outputTokensPerUser, d.inputTokensTotal, d.outputTokensTotal],
    a.runTimeoutMs, a.plans.map(p => [p.provider, p.grantId, p.planId, p.factsSha256])]);
}

/** Parses an already stored approval; it cannot establish that a human approved it. */
export function parseBilingualQualificationAuthority(v: unknown, now: number): BilingualQualificationAuthority | null {
  if (!count(now) || !record(v) || !exact(v, ['schema', 'enabled', 'authorizationId', 'approvalEvidenceSha256',
    'sourceSha', 'subjectHash', 'authorizedAtMs', 'expiresAtMs', 'baseline', 'maxAttempts', 'maxCostMicros',
    'maxAttemptCostMicros', 'dailyLimits', 'runTimeoutMs', 'plans', 'bindingSha256'])
    || v.schema !== BILINGUAL_QUALIFICATION.schema || v.enabled !== true || !uuid(v.authorizationId)
    || !digest(v.approvalEvidenceSha256) || !digest(v.subjectHash) || !digest(v.bindingSha256)
    || typeof v.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(v.sourceSha)
    || !count(v.authorizedAtMs) || v.authorizedAtMs > now || !count(v.expiresAtMs) || v.expiresAtMs <= now
    // Retain the existing one-hour qualification-permit bound; never extend profile TTL here.
    || v.expiresAtMs - v.authorizedAtMs > 3600000
    || !count(v.maxAttempts) || !count(v.maxCostMicros)
    || v.maxAttemptCostMicros !== BILINGUAL_QUALIFICATION.attemptCostMicros
    || v.runTimeoutMs !== BILINGUAL_QUALIFICATION.runTimeoutMs || !validBilingualQualificationDaily(v.dailyLimits)
    || !Array.isArray(v.plans) || v.plans.length !== AGENT_PROVIDER_IDS.length) return null;
  const b = v.baseline;
  if (!record(b) || !exact(b, ['ledgerSha256', 'attempts', 'heldCostMicros', 'providerAttempts'])
    || !digest(b.ledgerSha256) || !count(b.attempts) || !count(b.heldCostMicros)
    || !record(b.providerAttempts) || !exact(b.providerAttempts, AGENT_PROVIDER_IDS)
    || v.maxAttempts !== b.attempts + BILINGUAL_QUALIFICATION.additionalAttempts
    || v.maxCostMicros < 1 || v.maxCostMicros > BILINGUAL_QUALIFICATION.maxCostMicros || b.heldCostMicros > v.maxCostMicros) return null;
  const providerAttempts: Record<AgentProviderId, number> = { openai: 0, gemini: 0, anthropic: 0, xai: 0, deepseek: 0, qwen: 0, mistral: 0 };
  const plans: BilingualQualificationAuthority['plans'][number][] = [];
  for (const [index, provider] of AGENT_PROVIDER_IDS.entries()) {
    const n = b.providerAttempts[provider], p: unknown = v.plans[index];
    if (!count(n) || n > b.attempts || !record(p) || !exact(p, ['provider', 'grantId', 'planId', 'factsSha256'])
      || p.provider !== provider || !uuid(p.grantId) || !uuid(p.planId) || !digest(p.factsSha256)) return null;
    providerAttempts[provider] = n;
    plans.push(Object.freeze({ provider, grantId: p.grantId, planId: p.planId, factsSha256: p.factsSha256 }));
  }
  if (Object.values(providerAttempts).reduce((a, n) => a + n, 0) !== b.attempts
    || new Set(plans.map(p => p.grantId)).size !== plans.length || new Set(plans.map(p => p.planId)).size !== plans.length) return null;
  const authority: BilingualQualificationAuthority = Object.freeze({
    schema: v.schema, enabled: true, authorizationId: v.authorizationId, approvalEvidenceSha256: v.approvalEvidenceSha256,
    sourceSha: v.sourceSha, subjectHash: v.subjectHash, authorizedAtMs: v.authorizedAtMs, expiresAtMs: v.expiresAtMs,
    baseline: Object.freeze({ ledgerSha256: b.ledgerSha256, attempts: b.attempts, heldCostMicros: b.heldCostMicros,
      providerAttempts: Object.freeze(providerAttempts) }), maxAttempts: v.maxAttempts, maxCostMicros: v.maxCostMicros,
    maxAttemptCostMicros: v.maxAttemptCostMicros, dailyLimits: Object.freeze({ ...v.dailyLimits }),
    runTimeoutMs: v.runTimeoutMs, plans: Object.freeze(plans), bindingSha256: v.bindingSha256,
  });
  return bilingualQualificationBindingSha256(authority) === authority.bindingSha256 ? authority : null;
}

/** Pins provider/account/model/credential, account terms and exact one-use cases without a circular authority hash. */
export function qualificationPlanFactsSha256(p: QualificationAccountChargeProof): string {
  const t = p.accountTerms, r = t.risks, f = t.fundingChargeProtection, b = t.allInChargeBound, q = p.limitedOperation.permit;
  return hash([p.mode, p.grantId, p.provider, p.model, p.environment, p.accountId, p.projectId,
    p.credentialSha256, p.evidenceSha256, p.currency, p.serviceTier, p.pricingEvidenceSha256, p.limitedOperation.contractSha256,
    t.schema, t.observedAtMs, t.evidenceSha256, t.validity, r.autoReload, r.postpaid, r.overdraft, r.concurrentAccountUsage,
    f.kind, f.evidenceSha256, b.schema, b.currency, b.coverage, b.maxAdditionalMicros, b.evidenceSha256,
    q.schema, q.purpose, q.planId, q.sourceSha, q.caseSetSha, q.subjectHash, q.languages, q.authorizedAtMs, q.expiresAtMs,
    q.inputTokenCeiling, q.outputTokenCeiling, q.cases.map(c => [c.caseId, c.requestId, c.stage, c.language, c.inputSha256, c.contractSha256])]);
}

/** Extra authority is mandatory for v2 and forbidden for legacy plans. SQL independently checks the stored record. */
export function validQualificationPlanAuthority(p: QualificationAccountChargeProof, authority: BilingualQualificationAuthority | undefined, now: number): boolean {
  const a = p.limitedOperation, q = a.permit;
  if (a.schema === 'task217-profile-qualification-authority-v1') return authority === undefined;
  const current = parseBilingualQualificationAuthority(authority, now);
  if (!current || a.authoritySha256 !== current.bindingSha256 || a.authorizationId !== current.authorizationId
    || a.authorizedAtMs !== current.authorizedAtMs || a.maxCostMicros !== current.maxCostMicros || a.maxAttempts !== current.maxAttempts
    || q.sourceSha !== current.sourceSha || q.subjectHash !== current.subjectHash || q.expiresAtMs > current.expiresAtMs) return false;
  return current.plans.some(plan => plan.provider === p.provider && plan.grantId === p.grantId
    && plan.planId === q.planId && plan.factsSha256 === qualificationPlanFactsSha256(p));
}
