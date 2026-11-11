import 'server-only';
import { createHash } from 'node:crypto';
import { AGENT_PROVIDER_IDS } from './agent-capabilities';
import { validDurableAccountTerms, type DurableAccountChargeProof } from './dialogue-durable-authority';
import { approvedPublicPricingContract, publicPricingObservationCurrent, type PublicPricingObservation } from './dialogue-pricing-refresh';
import { canonicalOutputContract } from './agent-output-contract';
import { PLATFORM_UNITS_QUALIFICATION_CASES, PLATFORM_UNITS_CASE_SET_SHA256, qualificationInputSha256 } from './agent-qualification-cases';
import { PLATFORM_DIALOGUE_QUALIFICATION_CASES } from './platform-dialogue-qualification-cases';
import { PLATFORM_DIALOGUE_CASE_SET_SHA256 } from './platform-dialogue-cases';
import { fundingSubject, validFundingDailyLimits, type FundingAdmissionResult } from './dialogue-funding';
import type { DialogueDailyLimits } from './agent-dialogue';
import type { FundingRpc } from './dialogue-funding-store';
import { BILINGUAL_QUALIFICATION, validBilingualQualificationDaily, validQualificationPlanAuthority, type BilingualQualificationAuthority } from './qualification-authority';

export type QualificationContract = 'platform-units-v1' | 'platform-dialogue-v2';
export type QualificationCase = typeof PLATFORM_UNITS_QUALIFICATION_CASES[number] | typeof PLATFORM_DIALOGUE_QUALIFICATION_CASES[number];
export function qualificationRecipe(schema: unknown) {
 if (schema === 'task217-platform-units-measurement-v1') return Object.freeze({
  kind: 'platform-units-qualification' as const, contractId: 'platform-units-v1' as const,
  caseSetSha: PLATFORM_UNITS_CASE_SET_SHA256, casesPerLanguage: 2, cases: PLATFORM_UNITS_QUALIFICATION_CASES,
 });
 if (schema === 'task217-platform-dialogue-measurement-v2') return Object.freeze({
  kind: 'platform-dialogue-qualification' as const, contractId: 'platform-dialogue-v2' as const,
  caseSetSha: PLATFORM_DIALOGUE_CASE_SET_SHA256, casesPerLanguage: 4, cases: PLATFORM_DIALOGUE_QUALIFICATION_CASES,
 });
 return null;
}
export type QualificationPermit = Readonly<{
 schema: 'task217-platform-units-measurement-v1' | 'task217-platform-dialogue-measurement-v2'; purpose: 'profile-qualification'; planId: string;
 sourceSha: string; caseSetSha: string; subjectHash: string; languages: readonly ('ar' | 'en')[]; authorizedAtMs: number; expiresAtMs: number;
 inputTokenCeiling: number; outputTokenCeiling: number;
 cases: readonly Readonly<{ caseId: QualificationCase['caseId']; requestId: string; stage: 'discover'; language: 'ar' | 'en'; inputSha256: string; contractSha256: string }>[];
}>;
export type QualificationAccountChargeProof = Readonly<Omit<DurableAccountChargeProof,'mode'|'limitedOperation'> & {
 mode: 'bounded-account-qualification';
 limitedOperation: Readonly<{
  authorizationId: string;
  taskId: 'task217-text-pilot-2026-11-01'; dataScope: 'canonical-synthetic-measurement';
  authorizedAtMs: number;
  contractSha256: string; permit: QualificationPermit; bindingSha256: string;
 } & ({schema: 'task217-profile-qualification-authority-v1'; maxCostMicros: 1000000; maxAttempts: 28}
  | {schema: 'task217-profile-qualification-authority-v2'; maxCostMicros: number; maxAttempts: number; authoritySha256: string})>;
}>;
export type ApprovedQualificationPlan = Readonly<{
 kind: 'platform-units-qualification' | 'platform-dialogue-qualification'; subject: string; proof: QualificationAccountChargeProof;
 permit: QualificationPermit; daily: DialogueDailyLimits; maxCostMicros: number;
 authority?: BilingualQualificationAuthority;
 batchProofs?: readonly QualificationAccountChargeProof[];
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
 const recipe = record(v) ? qualificationRecipe(v.schema) : null;
 if (!record(v) || !exact(v,['schema','purpose','planId','sourceSha','caseSetSha','subjectHash','languages','authorizedAtMs','expiresAtMs','inputTokenCeiling','outputTokenCeiling','cases'])
  || !recipe || (v.schema !== 'task217-platform-units-measurement-v1' && v.schema !== 'task217-platform-dialogue-measurement-v2') || v.purpose !== 'profile-qualification' || !uuid(v.planId)
  || typeof v.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(v.sourceSha) || v.caseSetSha !== recipe.caseSetSha || !digest(v.subjectHash)
  || !count(v.authorizedAtMs) || !count(v.expiresAtMs) || v.expiresAtMs <= v.authorizedAtMs || v.expiresAtMs - v.authorizedAtMs > 3600000
  || !count(v.inputTokenCeiling) || v.inputTokenCeiling < 1 || v.inputTokenCeiling > 4096
  || !count(v.outputTokenCeiling) || v.outputTokenCeiling < 1 || v.outputTokenCeiling > 1024
  || !Array.isArray(v.languages) || !(['["ar"]','["en"]','["ar","en"]'].includes(JSON.stringify(v.languages)))
  || !Array.isArray(v.cases) || v.cases.length !== v.languages.length * recipe.casesPerLanguage) return null;
 const languages: Array<'ar' | 'en'> = v.languages.filter((item): item is 'ar' | 'en' => item === 'ar' || item === 'en');
 const selected = recipe.cases.filter(c => languages.includes(c.language));
 const cases: QualificationPermit['cases'][number][] = [];
 for (const [i,fixed] of selected.entries()) {
  const row: unknown = v.cases[i], contract = canonicalOutputContract(recipe.contractId,fixed.language);
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
 const tuple: unknown[] = [p.mode,p.grantId,p.provider,p.model,p.environment,p.accountId,p.projectId,p.credentialSha256,p.evidenceSha256,p.currency,p.serviceTier,p.pricingEvidenceSha256,
  a.schema,a.authorizationId,a.taskId,a.dataScope,a.maxCostMicros,a.maxAttempts,a.authorizedAtMs,a.contractSha256,
  t.schema,t.observedAtMs,t.evidenceSha256,t.validity,r.autoReload,r.postpaid,r.overdraft,r.concurrentAccountUsage,
  f.kind,f.evidenceSha256,b.schema,b.currency,b.coverage,b.maxAdditionalMicros,b.evidenceSha256,
  q.schema,q.purpose,q.planId,q.sourceSha,q.caseSetSha,q.subjectHash,q.languages,q.authorizedAtMs,q.expiresAtMs,q.inputTokenCeiling,q.outputTokenCeiling,
  q.cases.map(c=>[c.caseId,c.requestId,c.stage,c.language,c.inputSha256,c.contractSha256])];
 if (a.schema === 'task217-profile-qualification-authority-v2') tuple.push(a.authoritySha256);
 return hash(tuple);
}
export function parseQualificationProof(v: unknown, now: number): QualificationAccountChargeProof | null {
 if (!record(v) || !exact(v,['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256','accountTerms','limitedOperation'])
  || !count(now) || v.mode !== 'bounded-account-qualification' || !uuid(v.grantId)
  || typeof v.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(v.model) || v.environment !== 'provider-benchmark'
  || !identifier(v.accountId) || !identifier(v.projectId) || !digest(v.credentialSha256) || !digest(v.evidenceSha256)
  || v.currency !== 'USD' || v.serviceTier !== 'standard' || !digest(v.pricingEvidenceSha256) || !validDurableAccountTerms(v.accountTerms)) return null;
 const provider=AGENT_PROVIDER_IDS.find(p=>p===v.provider),a=v.limitedOperation;
 if (!provider || !record(a) || !exact(a,['schema','authorizationId','taskId','dataScope','maxCostMicros','maxAttempts','authorizedAtMs','contractSha256','permit','bindingSha256',
   ...(a.schema === 'task217-profile-qualification-authority-v2' ? ['authoritySha256'] : [])])
  || (a.schema !== 'task217-profile-qualification-authority-v1' && a.schema !== 'task217-profile-qualification-authority-v2')
  || !uuid(a.authorizationId) || a.taskId !== 'task217-text-pilot-2026-11-01'
  || a.dataScope !== 'canonical-synthetic-measurement' || !count(a.maxCostMicros) || !count(a.maxAttempts)
  || (a.schema === 'task217-profile-qualification-authority-v1' && (a.maxCostMicros !== 1000000 || a.maxAttempts !== 28))
  || (a.schema === 'task217-profile-qualification-authority-v2' && (!digest(a.authoritySha256)
   || a.maxCostMicros < 1 || a.maxCostMicros > BILINGUAL_QUALIFICATION.maxCostMicros || a.maxAttempts < BILINGUAL_QUALIFICATION.additionalAttempts))
  || !count(a.authorizedAtMs) || a.authorizedAtMs > now || !digest(a.contractSha256) || !digest(a.bindingSha256)
  || v.accountTerms.observedAtMs > a.authorizedAtMs) return null;
 const permit=parseQualificationPermit(a.permit),pricing=approvedPublicPricingContract(provider,v.model,v.pricingEvidenceSha256);
 if (!permit || permit.authorizedAtMs !== a.authorizedAtMs || now >= permit.expiresAtMs || !pricing || pricing.digest !== a.contractSha256
  || (a.schema === 'task217-profile-qualification-authority-v2' && (permit.schema !== 'task217-platform-dialogue-measurement-v2'
   || JSON.stringify(permit.languages) !== '["ar","en"]' || permit.cases.length !== 8))) return null;
 const authoritySha256 = a.schema === 'task217-profile-qualification-authority-v2' && digest(a.authoritySha256) ? a.authoritySha256 : null;
 const common = {authorizationId:a.authorizationId,taskId:a.taskId,dataScope:a.dataScope,authorizedAtMs:a.authorizedAtMs,
  contractSha256:a.contractSha256,permit,bindingSha256:a.bindingSha256} as const;
 const limitedOperation: QualificationAccountChargeProof['limitedOperation'] = authoritySha256
  ? {...common,schema:'task217-profile-qualification-authority-v2',maxCostMicros:a.maxCostMicros,maxAttempts:a.maxAttempts,authoritySha256}
  : {...common,schema:'task217-profile-qualification-authority-v1',maxCostMicros:1000000,maxAttempts:28};
 const proof: QualificationAccountChargeProof = {mode:v.mode,grantId:v.grantId,provider,model:v.model,environment:v.environment,
  accountId:v.accountId,projectId:v.projectId,credentialSha256:v.credentialSha256,evidenceSha256:v.evidenceSha256,currency:v.currency,serviceTier:v.serviceTier,
  pricingEvidenceSha256:v.pricingEvidenceSha256,accountTerms:v.accountTerms,limitedOperation};
 return qualificationAuthorityBindingSha256(proof) === a.bindingSha256 ? freeze(proof) : null;
}
/** Preflight all seven exact plans, including documented account extras. A public
 * token tariff alone is never an all-in price, and missing evidence is not zero.
 * This uses pinned planning rates; execution still refreshes pricing and reserves
 * atomically before each dispatch. The SQL loader also checks current history. */
export function qualificationBatchReservation(values: unknown, authority: BilingualQualificationAuthority | undefined, now: number) {
 if (!authority || !Array.isArray(values) || values.length !== AGENT_PROVIDER_IDS.length) return null;
 const proofs: QualificationAccountChargeProof[] = [];let costMicros=0,maxAttemptCostMicros=0;
 const requests=new Set<string>(),keys=new Set<string>();
 for (const [i,provider] of AGENT_PROVIDER_IDS.entries()) {
  const p=parseQualificationProof(values[i],now);
  if (!p || p.provider!==provider || p.limitedOperation.schema!=='task217-profile-qualification-authority-v2'
   || !validQualificationPlanAuthority(p,authority,now)) return null;
  const rate=approvedPublicPricingContract(p.provider,p.model,p.pricingEvidenceSha256),q=p.limitedOperation.permit;
  if (!rate || (rate.tariffBeforeMs!==null && now>=rate.tariffBeforeMs)) return null;
  for(const c of q.cases){const key=qualificationCaseKey(p,c.caseId);
   if(requests.has(c.requestId) || keys.has(key))return null;
   requests.add(c.requestId);keys.add(key);}
  const quote=Number((BigInt(q.inputTokenCeiling)*BigInt(rate.inputMicrosPerMillion)+BigInt(q.outputTokenCeiling)*BigInt(rate.outputMicrosPerMillion)+BigInt(999999))/BigInt(1000000)
   +BigInt(p.accountTerms.allInChargeBound.maxAdditionalMicros));
  if (!count(quote) || quote<1 || quote>authority.maxAttemptCostMicros) return null;
  costMicros+=quote*q.cases.length;maxAttemptCostMicros=Math.max(maxAttemptCostMicros,quote);proofs.push(p);
 }
 if (requests.size!==56 || keys.size!==56 || !count(costMicros) || authority.baseline.heldCostMicros+costMicros>authority.maxCostMicros) return null;
 return Object.freeze({proofs:Object.freeze(proofs),costMicros,maxAttemptCostMicros});
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
 authority?: BilingualQualificationAuthority;
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
    || !validQualificationPlanAuthority(r.proof,r.authority,Date.now())
    || !(r.authority ? validBilingualQualificationDaily(r.limits) : validFundingDailyLimits(r.limits,4096,1024))
    || (r.authority && r.costMicros > r.authority.maxAttemptCostMicros)
    || quoteQualification(r.proof,r.observation,Date.now())!==r.costMicros) return {kind:'denied'};
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
