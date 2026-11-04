import 'server-only';
import { createHash } from 'node:crypto';
import { AGENT_PROVIDER_IDS, type AgentCapabilityProfile, type AgentProviderId } from './agent-capabilities';

/** Permanent authority is not a balance, an expiring observation, or a new budget. */
export type DurableAccountChargeProof = Readonly<{
  mode: 'bounded-account-charge'; grantId: string; provider: AgentProviderId; model: string;
  environment: 'provider-benchmark'; accountId: string; projectId: string;
  credentialSha256: string; evidenceSha256: string; currency: 'USD'; serviceTier: 'standard';
  pricingEvidenceSha256: string;
  accountTerms: Readonly<{
    schema: 'task217-account-charge-terms-v1'; observedAtMs: number; evidenceSha256: string;
    validity: 'until-contract-change';
    risks: Readonly<{
      autoReload: 'off' | 'on' | 'unknown'; postpaid: 'blocked' | 'allowed' | 'unknown';
      overdraft: 'blocked' | 'allowed' | 'unknown'; concurrentAccountUsage: 'bounded' | 'unknown';
    }>;
    fundingChargeProtection: Readonly<{
      kind: 'documented-manual-funding-only' | 'documented-no-automatic-funding' | 'provider-enforced-no-funding';
      evidenceSha256: string;
    }>;
    allInChargeBound: Readonly<{
      schema: 'all-in-account-charge-bound-v1'; currency: 'USD';
      coverage: 'all-applicable-api-tax-fx-and-funding-charges';
      maxAdditionalMicros: number; evidenceSha256: string;
    }>;
  }>;
  limitedOperation: Readonly<{
    schema: 'task217-limited-operation-v2'; authorizationId: string;
    taskId: 'task217-text-pilot-2026-11-01'; dataScope: 'redacted-travel-or-server-units';
    maxCostMicros: 1000000; maxAttempts: 28; authorizedAtMs: number;
    duration: 'until-revoked-or-binding-change'; providerRisk: 'bounded-account-liability-with-observed-risks';
    acceptedProfileSha256s: readonly string[]; contractSha256: string; bindingSha256: string;
  }>;
}>;

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(v);
const member = (value: unknown, values: readonly string[]): value is string => typeof value === 'string' && values.includes(value);
const hash = (tuple: unknown) => createHash('sha256').update(JSON.stringify(tuple)).digest('hex');

export function validDurableAccountTerms(v: unknown): v is DurableAccountChargeProof['accountTerms'] {
  if (!object(v) || !keys(v, ['schema','observedAtMs','evidenceSha256','validity','risks','fundingChargeProtection','allInChargeBound'])
    || v.schema !== 'task217-account-charge-terms-v1' || !count(v.observedAtMs) || !digest(v.evidenceSha256)
    || v.validity !== 'until-contract-change') return false;
  const r = v.risks, f = v.fundingChargeProtection, a = v.allInChargeBound;
  return object(r) && keys(r, ['autoReload','postpaid','overdraft','concurrentAccountUsage'])
    && member(r.autoReload, ['off','unknown'])
    && member(r.postpaid, ['blocked','allowed','unknown'])
    && member(r.overdraft, ['blocked','allowed','unknown'])
    && member(r.concurrentAccountUsage, ['bounded','unknown'])
    // Unknown UI state alone is insufficient. Every accepted case needs a
    // separately documented reason this request cannot trigger funding charges.
    && object(f) && keys(f, ['kind','evidenceSha256']) && digest(f.evidenceSha256)
    && member(f.kind, ['documented-manual-funding-only','documented-no-automatic-funding','provider-enforced-no-funding'])
    && object(a) && keys(a, ['schema','currency','coverage','maxAdditionalMicros','evidenceSha256'])
    && a.schema === 'all-in-account-charge-bound-v1' && a.currency === 'USD'
    && a.coverage === 'all-applicable-api-tax-fx-and-funding-charges'
    && count(a.maxAdditionalMicros) && a.maxAdditionalMicros <= 1000000 && digest(a.evidenceSha256);
}

function validAuthority(v: unknown): v is DurableAccountChargeProof['limitedOperation'] {
  return object(v) && keys(v, ['schema','authorizationId','taskId','dataScope','maxCostMicros','maxAttempts','authorizedAtMs',
    'duration','providerRisk','acceptedProfileSha256s','contractSha256','bindingSha256'])
    && v.schema === 'task217-limited-operation-v2' && uuid(v.authorizationId)
    && v.taskId === 'task217-text-pilot-2026-11-01' && v.dataScope === 'redacted-travel-or-server-units'
    && v.maxCostMicros === 1000000 && v.maxAttempts === 28 && count(v.authorizedAtMs)
    && v.duration === 'until-revoked-or-binding-change' && v.providerRisk === 'bounded-account-liability-with-observed-risks'
    && digest(v.contractSha256) && digest(v.bindingSha256)
    && Array.isArray(v.acceptedProfileSha256s) && v.acceptedProfileSha256s.length > 0 && v.acceptedProfileSha256s.length <= 4
    && v.acceptedProfileSha256s.every((entry, i, values) => digest(entry) && (i === 0 || values[i - 1] < entry));
}

/** Ordered primitive tuple has the same representation in the atomic SQL gate. */
export function durableAuthorityBindingSha256(p: DurableAccountChargeProof) {
  const a = p.limitedOperation, t = p.accountTerms, r = t.risks, f = t.fundingChargeProtection, b = t.allInChargeBound;
  return hash([p.grantId,p.provider,p.model,p.environment,p.accountId,p.projectId,p.credentialSha256,p.evidenceSha256,
    p.mode,p.currency,p.serviceTier,p.pricingEvidenceSha256,
    a.schema,a.authorizationId,a.taskId,a.dataScope,a.maxCostMicros,a.maxAttempts,a.authorizedAtMs,
    a.duration,a.providerRisk,a.acceptedProfileSha256s,a.contractSha256,
    t.schema,t.observedAtMs,t.evidenceSha256,t.validity,r.autoReload,r.postpaid,r.overdraft,r.concurrentAccountUsage,
    f.kind,f.evidenceSha256,b.schema,b.currency,b.coverage,b.maxAdditionalMicros,b.evidenceSha256]);
}

/** Keep the original measurement dates and all measured outcomes in the binding. */
export function durableProfileSha256(p: AgentCapabilityProfile) {
  const m = p.measurement;
  return hash([p.provider,m.capability,m.language,m.model,m.environment,m.caseSetSha,m.sourceSha,m.cases,m.passed,
    m.measuredAtMs,m.expiresAtMs,m.latencyMs,m.inputTokenCeiling,m.outputTokenCeiling,m.costCeilingUsd]);
}

/** Server-stored opt-in only. No inherited v1 approval, artificial expiry, credit or quota. */
export function validDurableAccountChargeProof(v: unknown, now: number): v is DurableAccountChargeProof {
  if (!object(v)) return false;
  const provider = AGENT_PROVIDER_IDS.find(p => p === v.provider);
  if (!count(now) || !provider || !keys(v, ['mode','grantId','provider','model','environment','accountId','projectId',
    'credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256','accountTerms','limitedOperation'])
    || v.mode !== 'bounded-account-charge' || !uuid(v.grantId) || !AGENT_PROVIDER_IDS.some(p => p === v.provider)
    || typeof v.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(v.model)
    || v.environment !== 'provider-benchmark' || !id(v.accountId) || !id(v.projectId)
    || !digest(v.credentialSha256) || !digest(v.evidenceSha256) || v.currency !== 'USD' || v.serviceTier !== 'standard'
    || !digest(v.pricingEvidenceSha256) || !validDurableAccountTerms(v.accountTerms) || !validAuthority(v.limitedOperation)
    || v.accountTerms.observedAtMs > v.limitedOperation.authorizedAtMs || v.limitedOperation.authorizedAtMs > now) return false;
  // Build a checked value rather than casting untrusted JSON into an authority.
  const p: DurableAccountChargeProof = {
    mode: v.mode, grantId: v.grantId, provider, model: v.model,
    environment: v.environment, accountId: v.accountId, projectId: v.projectId,
    credentialSha256: v.credentialSha256, evidenceSha256: v.evidenceSha256, currency: v.currency, serviceTier: v.serviceTier,
    pricingEvidenceSha256: v.pricingEvidenceSha256, accountTerms: v.accountTerms, limitedOperation: v.limitedOperation,
  };
  return p.limitedOperation.bindingSha256 === durableAuthorityBindingSha256(p);
}

export function durableAuthorityAcceptsProfile(proof: DurableAccountChargeProof, p: AgentCapabilityProfile, now: number) {
  return validDurableAccountChargeProof(proof, now) && p.provider === proof.provider
    && p.measurement.model === proof.model && p.measurement.environment === proof.environment
    && p.measurement.measuredAtMs <= proof.limitedOperation.authorizedAtMs
    && proof.limitedOperation.acceptedProfileSha256s.includes(durableProfileSha256(p));
}
