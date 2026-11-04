import 'server-only';
import { createHash } from 'node:crypto';
import { AGENT_PROVIDER_IDS } from './agent-capabilities';
import { validDurableAccountTerms, type DurableAccountChargeProof } from './dialogue-durable-authority';
import { approvedPublicPricingContract, publicPricingObservationCurrent, type PublicPricingObservation } from './dialogue-pricing-refresh';
import { canonicalOutputContract } from './agent-output-contract';
import { PLATFORM_UNITS_QUALIFICATION_CASES, PLATFORM_UNITS_CASE_SET_SHA256, qualificationInputSha256 } from './agent-qualification-cases';
import { fundingSubject, validFundingDailyLimits, type FundingAdmissionResult } from './dialogue-funding';
import type { DialogueDailyLimits } from './agent-dialogue';
import type { FundingRpc } from './dialogue-funding-store';

export type QualificationCase = typeof PLATFORM_UNITS_QUALIFICATION_CASES[number];
export type QualificationPermit = Readonly<{
 schema: 'task217-platform-units-measurement-v1'; purpose: 'profile-qualification'; planId: string;
 sourceSha: string; caseSetSha: string; subjectHash: string; languages: readonly ('ar' | 'en')[]; authorizedAtMs: number; expiresAtMs: number;
 inputTokenCeiling: number; outputTokenCeiling: number;
 cases: readonly Readonly<{ caseId: QualificationCase['caseId']; requestId: string; stage: 'discover'; language: 'ar' | 'en'; inputSha256: string; contractSha256: string }>[];
}>;
export type QualificationAccountChargeProof = Readonly<Omit<DurableAccountChargeProof,'mode'|'limitedOperation'> & {
 mode: 'bounded-account-qualification';
 limitedOperation: Readonly<{
  schema: 'task217-profile-qualification-authority-v1'; authorizationId: string;
  taskId: 'task217-text-pilot-2026-11-01'; dataScope: 'canonical-synthetic-measurement';
  maxCostMicros: 1000000; maxAttempts: 28; authorizedAtMs: number;
  contractSha256: string; permit: QualificationPermit; bindingSha256: string;
 }>;
}>;
export type ApprovedQualificationPlan = Readonly<{
 kind: 'platform-units-qualification'; subject: string; proof: QualificationAccountChargeProof;
 permit: QualificationPermit; daily: DialogueDailyLimits; maxCostMicros: number;
}>;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(v);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function freeze<T>(value: T): Readonly<T> {
 if (value !== null && typeof value === 'object') for (const child of Object.values(value)) freeze(child);
 return Object.freeze(value);
}
export function parseQualificationPermit(v: unknown): QualificationPermit | null {
 if (!record(v) || !exact(v,['schema','purpose','planId','sourceSha','caseSetSha','subjectHash','languages','authorizedAtMs','expiresAtMs','inputTokenCeiling','outputTokenCeiling','cases'])
  || v.schema !== 'task217-platform-units-measurement-v1' || v.purpose !== 'profile-qualification' || !uuid(v.planId)
  || typeof v.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(v.sourceSha) || v.caseSetSha !== PLATFORM_UNITS_CASE_SET_SHA256 || !digest(v.subjectHash)
  || !count(v.authorizedAtMs) || !count(v.expiresAtMs) || v.expiresAtMs <= v.authorizedAtMs || v.expiresAtMs - v.authorizedAtMs > 3600000
  || !count(v.inputTokenCeiling) || v.inputTokenCeiling < 1 || v.inputTokenCeiling > 4096
  || !count(v.outputTokenCeiling) || v.outputTokenCeiling < 1 || v.outputTokenCeiling > 1024
  || !Array.isArray(v.languages) || !(['["ar"]','["en"]','["ar","en"]'].includes(JSON.stringify(v.languages)))
  || !Array.isArray(v.cases) || v.cases.length !== v.languages.length * 2) return null;
 const languages: Array<'ar' | 'en'> = v.languages.filter((item): item is 'ar' | 'en' => item === 'ar' || item === 'en');
 const selected = PLATFORM_UNITS_QUALIFICATION_CASES.filter(c => languages.includes(c.language));
 const cases: QualificationPermit['cases'][number][] = [];
 for (const [i,fixed] of selected.entries()) {
  const row: unknown = v.cases[i], contract = canonicalOutputContract('platform-units-v1',fixed.language);
  if (!record(row) || !exact(row,['caseId','requestId','stage','language','inputSha256','contractSha256'])
   || row.caseId !== fixed.caseId || !uuid(row.requestId) || row.stage !== fixed.stage || row.language !== fixed.language
   || row.inputSha256 !== qualificationInputSha256(fixed) || row.contractSha256 !== contract.digest
   || Buffer.byteLength(fixed.prompt + fixed.message,'utf8') + 128 > v.inputTokenCeiling) return null;
  cases.push(Object.freeze({caseId:fixed.caseId,requestId:row.requestId,stage:fixed.stage,language:fixed.language,inputSha256:row.inputSha256,contractSha256:row.contractSha256}));
 }
 if (new Set(cases.map(c=>c.requestId)).size !== cases.length) return null;
 return freeze({schema:v.schema,purpose:v.purpose,planId:v.planId,sourceSha:v.sourceSha,caseSetSha:v.caseSetSha,
  subjectHash:v.subjectHash,languages,authorizedAtMs:v.authorizedAtMs,expiresAtMs:v.expiresAtMs,inputTokenCeiling:v.inputTokenCeiling,outputTokenCeiling:v.outputTokenCeiling,cases});
}
/** Immutable financial authority + exact canonical input/output + case/request IDs.
 * This is a separate qualification purpose; no accepted runtime profile is needed
 * and this proof cannot fund the Customer dialogue path. */
export function qualificationAuthorityBindingSha256(p: QualificationAccountChargeProof) {
 const a=p.limitedOperation,t=p.accountTerms,r=t.risks,f=t.fundingChargeProtection,b=t.allInChargeBound,q=a.permit;
 return hash([p.mode,p.grantId,p.provider,p.model,p.environment,p.accountId,p.projectId,p.credentialSha256,p.evidenceSha256,p.currency,p.serviceTier,p.pricingEvidenceSha256,
  a.schema,a.authorizationId,a.taskId,a.dataScope,a.maxCostMicros,a.maxAttempts,a.authorizedAtMs,a.contractSha256,
  t.schema,t.observedAtMs,t.evidenceSha256,t.validity,r.autoReload,r.postpaid,r.overdraft,r.concurrentAccountUsage,
  f.kind,f.evidenceSha256,b.schema,b.currency,b.coverage,b.maxAdditionalMicros,b.evidenceSha256,
  q.schema,q.purpose,q.planId,q.sourceSha,q.caseSetSha,q.subjectHash,q.languages,q.authorizedAtMs,q.expiresAtMs,q.inputTokenCeiling,q.outputTokenCeiling,
  q.cases.map(c=>[c.caseId,c.requestId,c.stage,c.language,c.inputSha256,c.contractSha256])]);
}
export function parseQualificationProof(v: unknown, now: number): QualificationAccountChargeProof | null {
 if (!record(v) || !exact(v,['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256','accountTerms','limitedOperation'])
  || !count(now) || v.mode !== 'bounded-account-qualification' || !uuid(v.grantId)
  || typeof v.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(v.model) || v.environment !== 'provider-benchmark'
  || !identifier(v.accountId) || !identifier(v.projectId) || !digest(v.credentialSha256) || !digest(v.evidenceSha256)
  || v.currency !== 'USD' || v.serviceTier !== 'standard' || !digest(v.pricingEvidenceSha256) || !validDurableAccountTerms(v.accountTerms)) return null;
 const provider=AGENT_PROVIDER_IDS.find(p=>p===v.provider),a=v.limitedOperation;
 if (!provider || !record(a) || !exact(a,['schema','authorizationId','taskId','dataScope','maxCostMicros','maxAttempts','authorizedAtMs','contractSha256','permit','bindingSha256'])
  || a.schema !== 'task217-profile-qualification-authority-v1' || !uuid(a.authorizationId) || a.taskId !== 'task217-text-pilot-2026-11-01'
  || a.dataScope !== 'canonical-synthetic-measurement' || a.maxCostMicros !== 1000000 || a.maxAttempts !== 28
  || !count(a.authorizedAtMs) || a.authorizedAtMs > now || !digest(a.contractSha256) || !digest(a.bindingSha256)
  || v.accountTerms.observedAtMs > a.authorizedAtMs) return null;
 const permit=parseQualificationPermit(a.permit),pricing=approvedPublicPricingContract(provider,v.model,v.pricingEvidenceSha256);
 if (!permit || permit.authorizedAtMs !== a.authorizedAtMs || now >= permit.expiresAtMs || !pricing || pricing.digest !== a.contractSha256) return null;
 const proof: QualificationAccountChargeProof = {mode:v.mode,grantId:v.grantId,provider,model:v.model,environment:v.environment,
  accountId:v.accountId,projectId:v.projectId,credentialSha256:v.credentialSha256,evidenceSha256:v.evidenceSha256,currency:v.currency,serviceTier:v.serviceTier,
  pricingEvidenceSha256:v.pricingEvidenceSha256,accountTerms:v.accountTerms,limitedOperation:{schema:a.schema,authorizationId:a.authorizationId,
   taskId:a.taskId,dataScope:a.dataScope,maxCostMicros:a.maxCostMicros,maxAttempts:a.maxAttempts,authorizedAtMs:a.authorizedAtMs,
   contractSha256:a.contractSha256,permit,bindingSha256:a.bindingSha256}};
 return qualificationAuthorityBindingSha256(proof) === a.bindingSha256 ? freeze(proof) : null;
}
export function quoteQualification(proof: QualificationAccountChargeProof, observation: PublicPricingObservation, now: number) {
 if (!parseQualificationProof(proof,now) || !publicPricingObservationCurrent(observation,proof,now)) return null;
 const p=proof.limitedOperation.permit;
 const cost=Number((BigInt(p.inputTokenCeiling)*BigInt(observation.inputMicrosPerMillion)+BigInt(p.outputTokenCeiling)*BigInt(observation.outputMicrosPerMillion)+BigInt(999999))/BigInt(1000000)
  +BigInt(proof.accountTerms.allInChargeBound.maxAdditionalMicros));
 return count(cost) && cost>0 && cost<=proof.limitedOperation.maxCostMicros ? cost : null;
}
export function qualificationCaseKey(proof: QualificationAccountChargeProof, caseId: QualificationCase['caseId']) {
 const p=proof.limitedOperation.permit;
 return hash([proof.limitedOperation.taskId,proof.provider,p.caseSetSha,caseId]);
}
export type QualificationReservation = Readonly<{
 proof: QualificationAccountChargeProof; subject: string; attemptId: string; runId: string; caseId: QualificationCase['caseId'];
 costMicros: number; observation: PublicPricingObservation; limits: DialogueDailyLimits; dayStartMs: number;
}>;
export interface QualificationAdmission {
 reserveQualification(request: QualificationReservation, signal: AbortSignal): Promise<FundingAdmissionResult>;
}
/** Same RPC and durable task ledger. No retry or refund after an unknown response. */
export function createQualificationAdmission(rpc: FundingRpc): QualificationAdmission {
 return {async reserveQualification(r,signal) {
  try {
   const p=r.proof.limitedOperation.permit,c=p.cases.find(c=>c.caseId===r.caseId);
   if (signal.aborted || !uuid(r.attemptId) || !uuid(r.runId) || !c || fundingSubject(r.subject)!==p.subjectHash
    || !validFundingDailyLimits(r.limits,4096,1024) || quoteQualification(r.proof,r.observation,Date.now())!==r.costMicros) return {kind:'denied'};
   const measurementRequest={planId:p.planId,caseId:c.caseId,runId:r.runId};
   const executionPricing={schema:'task217-qualification-execution-v1',observation:r.observation,
    authorityBindingSha256:r.proof.limitedOperation.bindingSha256,planId:p.planId,caseId:c.caseId,runId:r.runId,inputSha256:c.inputSha256,
    contractSha256:c.contractSha256,qualificationKey:qualificationCaseKey(r.proof,c.caseId),
    attemptId:r.attemptId,requestId:c.requestId,subjectHash:p.subjectHash,stage:c.stage,language:c.language,
    inputTokenCeiling:p.inputTokenCeiling,outputTokenCeiling:p.outputTokenCeiling};
   const {data,error}=await rpc('reserve_dabra_dialogue_attempt',{p_attempt_id:r.attemptId,p_request_id:c.requestId,p_stage:c.stage,
    p_subject_hash:p.subjectHash,p_grant_id:r.proof.grantId,p_proof:{...r.proof,measurementRequest,executionPricing},
    p_input_tokens:p.inputTokenCeiling,p_output_tokens:p.outputTokenCeiling,p_cost_micros:r.costMicros,p_limits:r.limits,p_day_start_ms:r.dayStartMs},signal);
   if(signal.aborted || error || !record(data) || data.decision!=='admitted' || data.attempt_id!==r.attemptId
    || !count(data.pricing_expires_at_ms) || data.pricing_expires_at_ms<=Date.now())return {kind:'denied'};
   return {kind:'admitted',attemptId:r.attemptId,pricingExpiresAtMs:data.pricing_expires_at_ms};
  }catch{return {kind:'denied'};}
 }};
}
