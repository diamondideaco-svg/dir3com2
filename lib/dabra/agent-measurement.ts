import 'server-only';
import { parseQualificationProof, quoteQualification, qualificationRecipe, type QualificationContract, type QualificationCase, type QualificationAdmission, type ApprovedQualificationPlan } from './dialogue-qualification';
import { composePublicAgentDialogue } from './agent-platform-units';
import { composePlatformDialogue } from './agent-platform-dialogue';
import { refreshPublicDialoguePricing, type PublicPricingObservation } from './dialogue-pricing-refresh';
import { createHash, randomUUID } from 'node:crypto';
import { classifierPrompt } from './agent-planner';
import { parseAgentTool } from './agent-contract';
import { generalTravelContext, GENERAL_TRAVEL_PROMPT, parseGeneralTravelAdvice } from './agent-general-travel';
import { dialogueDay, type DialogueDailyLimits } from './agent-dialogue';
import { fundingSubject, fundingAuthorizationWindow, fundingProofForCeilings, validTask217PilotEnvelope, quoteDialogueFunding, validFundingDailyLimits,
  type DialogueFundingProof, type FundingDialogueAdmission } from './dialogue-funding';
import { callInternalAgentProvider, internalAgentConfiguration } from '../ai2/runtime/agent-provider-dispatch';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function general(language: 'ar' | 'en', question: string) {
  const context = generalTravelContext(question, []);
  if (!context) throw new Error('invalid_fixed_measurement_case');
  return JSON.stringify({ language, general: context });
}
// Public, immutable fixtures, never a customer message/history or a CLI-supplied prompt.
export const FIRST_PROFILE_CASES = Object.freeze([
  Object.freeze({ caseId: 'intent-ar', stage: 'intent.classify', language: 'ar', prompt: classifierPrompt,
    message: 'هل الجو ممطر في مدينة الاختبار اليوم؟' }),
  Object.freeze({ caseId: 'intent-en', stage: 'intent.classify', language: 'en', prompt: classifierPrompt,
    message: 'Show a map for Example City.' }),
  Object.freeze({ caseId: 'discover-ar', stage: 'discover', language: 'ar', prompt: GENERAL_TRAVEL_PROMPT,
    message: general('ar', 'أعطني نصائح لترتيب حقيبة يوم خفيف مع الأطفال في الخارج مع فترات راحة وظل.') }),
  Object.freeze({ caseId: 'discover-en', stage: 'discover', language: 'en', prompt: GENERAL_TRAVEL_PROMPT,
    message: general('en', 'Suggest a quiet day out with children, outdoors, with rest breaks and shade.') }),
] as const);
export const FIRST_PROFILE_CASE_SET_SHA = createHash('sha256').update(JSON.stringify(FIRST_PROFILE_CASES)).digest('hex');
type FixedCase = typeof FIRST_PROFILE_CASES[number];
export type FirstProfilePermit = Readonly<{
  schema: 'task217-first-profile-v1'; planId: string; sourceSha: string; caseSetSha: string; subjectHash: string;
  expiresAtMs: number; inputTokenCeiling: number; outputTokenCeiling: number;
  cases: readonly Readonly<{ caseId: FixedCase['caseId']; requestId: string; stage: FixedCase['stage']; language: FixedCase['language'] }>[];
}>;
/** Shape validation is not approval. Only a matching stored grant can authorize this permit. */
export function parseFirstProfilePermit(value: unknown): FirstProfilePermit | null {
  if (!object(value) || Object.keys(value).length !== 9 || value.schema !== 'task217-first-profile-v1'
    || typeof value.planId !== 'string' || !uuid.test(value.planId)
    || typeof value.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceSha)
    || typeof value.caseSetSha !== 'string' || value.caseSetSha !== FIRST_PROFILE_CASE_SET_SHA
    || typeof value.subjectHash !== 'string' || !digest.test(value.subjectHash)
    || !integer(value.expiresAtMs) || !integer(value.inputTokenCeiling) || !integer(value.outputTokenCeiling)
    || value.inputTokenCeiling < 1 || value.inputTokenCeiling > 4096 || value.outputTokenCeiling < 1 || value.outputTokenCeiling > 1024
    || !Array.isArray(value.cases) || value.cases.length !== 4) return null;
  const cases: FirstProfilePermit['cases'][number][] = [];
  for (const fixed of FIRST_PROFILE_CASES) {
    const matches: unknown[] = value.cases.filter((v: unknown) => object(v) && v.caseId === fixed.caseId);
    const row = matches[0];
    if (matches.length !== 1 || !object(row) || Object.keys(row).length !== 4
      || row.stage !== fixed.stage || row.language !== fixed.language || typeof row.requestId !== 'string' || !uuid.test(row.requestId)) return null;
    cases.push(Object.freeze({ caseId: fixed.caseId, stage: fixed.stage, language: fixed.language, requestId: row.requestId.toLowerCase() }));
  }
  if (new Set(cases.map(c => c.requestId)).size !== 4) return null;
  return Object.freeze({ schema: value.schema, planId: value.planId.toLowerCase(), sourceSha: value.sourceSha,
    caseSetSha: value.caseSetSha, subjectHash: value.subjectHash, expiresAtMs: value.expiresAtMs,
    inputTokenCeiling: value.inputTokenCeiling, outputTokenCeiling: value.outputTokenCeiling, cases: Object.freeze(cases) });
}
export type ApprovedFirstProfilePlan = Readonly<{
  subject: string; proof: Exclude<DialogueFundingProof, { mode: 'bounded-account-charge' }>; permit: FirstProfilePermit; daily: DialogueDailyLimits; maxCostMicros: number;
}>;
export type MeasurementObservation = Readonly<{
  caseId: FixedCase['caseId']; requestId: string; attemptId: string; stage: FixedCase['stage']; language: FixedCase['language'];
  model: string | null; completedAtMs: number; latencyMs: number; inputTokens: number | null; outputTokens: number | null;
  reservedCostMicros: number; transportOk: boolean; schemaValid: boolean; answer: string;
}>;
export type MeasurementStopReason = 'permit' | 'funding-window' | 'cancelled' | 'deadline' | 'input-ceiling'
  | 'configuration' | 'credential' | 'source' | 'funding' | 'authority' | 'admission' | 'admission-unknown'
  | 'pricing-deadline' | 'provider-unknown' | 'provider-output' | 'runtime';
export type FirstProfileMeasurementResult = Readonly<{
  qualified: false; semanticReview: 'required'; observations: readonly MeasurementObservation[];
}> & (
  | Readonly<{ kind: 'candidate' }>
  | Readonly<{ kind: 'blocked' | 'stopped'; diagnostic: Readonly<{
      reason: MeasurementStopReason; caseId: FixedCase['caseId'] | null; stage: FixedCase['stage'] | null;
    }> }>
);
export type MeasurementDependencies = Readonly<{
  admission: FundingDialogueAdmission;
  authorityCurrent: (signal: AbortSignal) => Promise<boolean>;
  sourceSha: () => string;
  configuration: typeof internalAgentConfiguration;
  dispatch: typeof callInternalAgentProvider;
}>;
async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  let stop: (() => void) | undefined;
  const stopped = new Promise<undefined>(resolve => {
    stop = () => resolve(undefined);
    if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
  });
  try { return await Promise.race([promise, stopped]); }
  finally { if (stop) signal.removeEventListener('abort', stop); }
}
/**
 * No profile is fabricated and no candidate is published. Each of the four calls needs
 * its own durable reservation. Any unknown claim/send stops the run; its hold remains.
 */
export async function measureFirstProfile(plan: ApprovedFirstProfilePlan, dependencies: MeasurementDependencies, signal?: AbortSignal): Promise<FirstProfileMeasurementResult> {
  const observations: MeasurementObservation[] = [];
  const finish = (kind: 'blocked' | 'stopped', reason: MeasurementStopReason, fixed?: FixedCase): FirstProfileMeasurementResult =>
    Object.freeze({ kind, qualified: false, semanticReview: 'required', observations: Object.freeze(observations),
      diagnostic: Object.freeze({ reason, caseId: fixed?.caseId ?? null, stage: fixed?.stage ?? null }) });
  const permit = parseFirstProfilePermit(plan.proof.measurementPermit);
  if (!permit || JSON.stringify(permit) !== JSON.stringify(plan.permit)
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(plan.subject) || fundingSubject(plan.subject) !== permit.subjectHash
    || !integer(plan.maxCostMicros) || !validFundingDailyLimits(plan.daily, 4096, 1024)) return finish('blocked', 'permit');
  const pilot = validTask217PilotEnvelope(plan.proof.pilotEnvelope);
  const window = fundingAuthorizationWindow(plan.proof, Date.now());
  if (!window) return finish('blocked', 'funding-window');
  // The first durable admission owns this authorization; later cases retain that
  // owner. A restarted/concurrent process gets a new runId and cannot reuse it.
  const runId = 'snapshotUse' in plan.proof ? randomUUID() : undefined;
  const configuration = () => dependencies.configuration(plan.proof.provider, pilot ? plan.proof.model : undefined);
  const ceilings = { provider: plan.proof.provider, model: plan.proof.model, environment: plan.proof.environment,
    inputTokenCeiling: permit.inputTokenCeiling, outputTokenCeiling: permit.outputTokenCeiling };
  for (const fixed of FIRST_PROFILE_CASES) {
    const approvedCase = permit.cases.find(c => c.caseId === fixed.caseId);
    if (!approvedCase) return finish('stopped', 'permit', fixed);
    if (signal?.aborted) return finish('stopped', 'cancelled', fixed);
    const start = Date.now();
    let end = Math.min(start + 12000, permit.expiresAtMs, window.expiresAtMs, plan.proof.quotaWindowEndMs, dialogueDay(start).dayEndMs);
    if (end <= start) return finish('blocked', 'deadline', fixed);
    if (Buffer.byteLength(fixed.prompt + fixed.message, 'utf8') + 128 > permit.inputTokenCeiling) return finish('blocked', 'input-ceiling', fixed);
    const controller = new AbortController();
    let stopSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(end - start), ...(signal ? [signal] : [])]);
    let reason: MeasurementStopReason = 'runtime';
    let failureContext: MeasurementStopReason = 'runtime';
    const ready = () => {
      if (stopSignal.aborted) { reason = signal?.aborted ? 'cancelled' : 'deadline'; return false; }
      const config = configuration();
      if (!config || config.model !== plan.proof.model) { reason = 'configuration'; return false; }
      if (createHash('sha256').update(config.apiKey).digest('hex') !== plan.proof.credentialSha256) { reason = 'credential'; return false; }
      if (dependencies.sourceSha() !== permit.sourceSha) { reason = 'source'; return false; }
      // Git/config verification is synchronous but may block. Read time AFTER it, not before it.
      const now = Date.now(), cost = quoteDialogueFunding(plan.proof, ceilings, now);
      if (stopSignal.aborted || now >= end || now >= permit.expiresAtMs) {
        reason = signal?.aborted ? 'cancelled' : 'deadline'; return false;
      }
      if (permit.expiresAtMs > window.expiresAtMs || !fundingProofForCeilings(plan.proof, ceilings, now)
        || cost === null || cost > plan.maxCostMicros) { reason = 'funding'; return false; }
      return true;
    };
    const current = async () => {
      if (!ready()) return false;
      const approved = await bounded(dependencies.authorityCurrent(stopSignal), stopSignal);
      if (approved !== true) {
        reason = stopSignal.aborted ? signal?.aborted ? 'cancelled' : 'deadline' : 'authority';
        return false;
      }
      return ready();
    };
    try {
      if (!await current() || !ready()) return finish('blocked', reason, fixed);
      const cost = quoteDialogueFunding(plan.proof, ceilings, Date.now());
      if (cost === null) return finish('blocked', 'funding', fixed);
      if (!ready()) return finish('blocked', reason, fixed);
      const attemptId = runId && fixed.caseId === 'intent-ar' ? runId : randomUUID();
      failureContext = 'admission-unknown';
      const claim = await bounded(dependencies.admission.reserve({
        policyId: 'task217-existing-credit-v2', attemptId, requestId: approvedCase.requestId, stage: fixed.stage, subject: plan.subject,
        nowMs: Date.now(), ...dialogueDay(Date.now()), proof: plan.proof, inputTokens: permit.inputTokenCeiling,
        outputTokens: permit.outputTokenCeiling, costMicros: cost, limits: plan.daily,
        measurementRequest: { planId: permit.planId, caseId: fixed.caseId, ...(runId ? { runId } : {}) },
      }, stopSignal), stopSignal);
      failureContext = 'runtime';
      if (runId && claim?.kind === 'admitted') {
        if (!integer(claim.pricingExpiresAtMs)) return finish('stopped', 'pricing-deadline', fixed);
        end = Math.min(end, claim.pricingExpiresAtMs);
        const remaining = end - Date.now();
        if (remaining <= 0) return finish('stopped', 'pricing-deadline', fixed);
        // A fresh policy proof cannot renew the stored grant's independent price
        // deadline. Check it around later awaits and abort transport at that bound.
        stopSignal = AbortSignal.any([stopSignal, AbortSignal.timeout(remaining)]);
      }
      if (!ready()) return finish('stopped', reason, fixed);
      if (claim?.kind !== 'admitted' || claim.attemptId !== attemptId) return finish('stopped', claim ? 'admission' : 'admission-unknown', fixed);
      if (!await current() || !ready()) return finish('stopped', reason, fixed);
      const config = configuration();
      if (!config || config.model !== plan.proof.model) return finish('stopped', 'configuration', fixed);
      if (createHash('sha256').update(config.apiKey).digest('hex') !== plan.proof.credentialSha256) return finish('stopped', 'credential', fixed);
      if (!ready()) return finish('stopped', reason, fixed);
      const dispatchedAt = Date.now();
      if (dispatchedAt >= end || stopSignal.aborted) return finish('stopped', signal?.aborted ? 'cancelled' : 'deadline', fixed);
      failureContext = 'provider-unknown';
      const result = await bounded(dependencies.dispatch(plan.proof.provider, config, fixed.message, {
        prompt: fixed.prompt, language: fixed.language, classifier: fixed.stage === 'intent.classify',
        maxOutputTokens: permit.outputTokenCeiling, timeoutMs: Math.max(1, end - Date.now()),
        signal: stopSignal, standardBilling: plan.proof.mode === 'existing-credit', pilotMeasurement: pilot,
      }), stopSignal);
      failureContext = 'runtime';
      if (!result) return finish('stopped', 'provider-unknown', fixed);
      let schemaValid = false;
      try {
        schemaValid = fixed.stage === 'intent.classify'
          ? parseAgentTool(JSON.parse(result.answer)) !== null
          : parseGeneralTravelAdvice(result.answer, fixed.language) !== null;
      } catch { /* An invalid response cannot qualify the candidate. */ }
      observations.push(Object.freeze({
        caseId: fixed.caseId, requestId: approvedCase.requestId, attemptId, stage: fixed.stage, language: fixed.language,
        model: result.model === plan.proof.model ? result.model : null, completedAtMs: Date.now(), latencyMs: Math.max(0, Date.now() - dispatchedAt),
        inputTokens: integer(result.inputTokens) ? result.inputTokens : null, outputTokens: integer(result.outputTokens) ? result.outputTokens : null,
        reservedCostMicros: cost, transportOk: result.ok, schemaValid,
        // Only the fixed public case output, bounded. No config/proof, key or account evidence is returned.
        answer: schemaValid ? result.answer.slice(0, 4096) : '',
      }));
      if (!ready()) return finish('stopped', reason, fixed);
      if (!result.ok) return finish('stopped', 'provider-unknown', fixed);
      if (!schemaValid || result.model !== config.model || result.citations.length !== 0
        || !integer(result.inputTokens) || result.inputTokens > permit.inputTokenCeiling
        || !integer(result.outputTokens) || result.outputTokens > permit.outputTokenCeiling) return finish('stopped', 'provider-output', fixed);
      if (!await current() || !ready()) return finish('stopped', reason, fixed);
    } catch { return finish('stopped', failureContext, fixed); }
    finally { controller.abort(); }
  }
  return Object.freeze({ kind: 'candidate', qualified: false, semanticReview: 'required', observations: Object.freeze(observations) });
}

// Qualification is separate from the historical four-case v1 recipe above.
// It never fabricates or publishes a runtime capability profile.
export type QualificationObservation = Readonly<Omit<MeasurementObservation,'caseId'> & { caseId: QualificationCase['caseId'] }>;
export type QualificationMeasurementResult = Readonly<{
 kind: 'candidate' | 'blocked' | 'stopped'; qualified: false; semanticReview: 'required';
 observations: readonly QualificationObservation[]; diagnostic?: Readonly<{reason: string; caseId: QualificationCase['caseId'] | null}>;
}>;
export type QualificationMeasurementDependencies = Readonly<{
 admission: QualificationAdmission; authorityCurrent: (signal: AbortSignal) => Promise<boolean>;
 sourceSha: () => string; configuration: typeof internalAgentConfiguration; dispatch: typeof callInternalAgentProvider;
}>;
export async function measurePlatformUnitsProfile(plan: ApprovedQualificationPlan, deps: QualificationMeasurementDependencies,
 signal?: AbortSignal): Promise<QualificationMeasurementResult> {
 return measureQualificationProfile('platform-units-v1',plan,deps,signal);
}
export async function measurePlatformDialogueProfile(plan: ApprovedQualificationPlan, deps: QualificationMeasurementDependencies,
 signal?: AbortSignal): Promise<QualificationMeasurementResult> {
 return measureQualificationProfile('platform-dialogue-v2',plan,deps,signal);
}
async function measureQualificationProfile(contractId: QualificationContract, plan: ApprovedQualificationPlan, deps: QualificationMeasurementDependencies,
 signal?: AbortSignal): Promise<QualificationMeasurementResult> {
 const observations: QualificationObservation[] = [];
 const stop=(kind:'blocked'|'stopped',reason:string,fixed?:QualificationCase):QualificationMeasurementResult=>
  Object.freeze({kind,qualified:false,semanticReview:'required',observations:Object.freeze(observations),
   diagnostic:Object.freeze({reason,caseId:fixed?.caseId??null})});
 const proof=parseQualificationProof(plan.proof,Date.now()),permit=proof?.limitedOperation.permit;
 const recipe=qualificationRecipe(permit?.schema);
 if (!proof || !permit || !recipe || recipe.contractId!==contractId || recipe.kind!==plan.kind
  || JSON.stringify(permit)!==JSON.stringify(plan.permit) || fundingSubject(plan.subject)!==permit.subjectHash
  || !integer(plan.maxCostMicros) || plan.maxCostMicros>1000000 || !validFundingDailyLimits(plan.daily,4096,1024)) return stop('blocked','permit');
 const selected=recipe.cases.filter(c=>permit.languages.includes(c.language));
 const runId=randomUUID();
 for(const [index,fixed] of selected.entries()) {
  const approved=permit.cases[index];if(!approved || approved.caseId!==fixed.caseId)return stop('blocked','permit',fixed);
  const start=Date.now();let end=Math.min(start+12000,permit.expiresAtMs,dialogueDay(start).dayEndMs);
  if(signal?.aborted || end<=start)return stop('blocked',signal?.aborted?'cancelled':'deadline',fixed);
  const controller=new AbortController();
  let boundedSignal=AbortSignal.any([controller.signal,AbortSignal.timeout(end-start),...(signal?[signal]:[])]);
  let pricing:PublicPricingObservation|null=null,reason='runtime',failure='runtime';
  const ready=()=>{
   if(boundedSignal.aborted || Date.now()>=end){reason=signal?.aborted?'cancelled':'deadline';return false;}
   const config=deps.configuration(proof.provider,proof.model);
   if(!config || config.model!==proof.model){reason='configuration';return false;}
   if(createHash('sha256').update(config.apiKey).digest('hex')!==proof.credentialSha256){reason='credential';return false;}
   if(deps.sourceSha()!==permit.sourceSha){reason='source';return false;}
   const at=Date.now();
   if(boundedSignal.aborted || at>=end || !parseQualificationProof(proof,at)){reason='deadline';return false;}
   if(pricing){const quote=quoteQualification(proof,pricing,at);if(quote===null || quote>plan.maxCostMicros){reason='pricing';return false;}}
   return true;
  };
  const current=async()=>{
   if(!ready())return false;
   const allowed=await bounded(deps.authorityCurrent(boundedSignal),boundedSignal);
   if(allowed!==true){reason=boundedSignal.aborted?'deadline':'authority';return false;}
   return ready();
  };
  try {
   if(!await current() || !ready())return stop('blocked',reason,fixed);
   pricing=await bounded(refreshPublicDialoguePricing(proof,boundedSignal),boundedSignal)??null;
   if(!pricing || !await current() || !ready())return stop('blocked',pricing?reason:'pricing',fixed);
   const cost=quoteQualification(proof,pricing,Date.now());
   if(cost===null || cost>plan.maxCostMicros || !ready())return stop('blocked','pricing',fixed);
   const attemptId=index===0?runId:randomUUID();
   failure='admission-unknown';
   const claim=await bounded(deps.admission.reserveQualification({proof,subject:plan.subject,attemptId,runId,caseId:fixed.caseId,
    costMicros:cost,observation:pricing,limits:plan.daily,dayStartMs:dialogueDay(Date.now()).dayStartMs},boundedSignal),boundedSignal);
   failure='runtime';
   if(claim?.kind!=='admitted' || claim.attemptId!==attemptId)return stop('stopped',claim?'admission':'admission-unknown',fixed);
   if(!integer(claim.pricingExpiresAtMs))return stop('stopped','pricing-deadline',fixed);
   end=Math.min(end,claim.pricingExpiresAtMs);
   if(end<=Date.now())return stop('stopped','pricing-deadline',fixed);
   boundedSignal=AbortSignal.any([boundedSignal,AbortSignal.timeout(end-Date.now())]);
   if(!await current() || !ready())return stop('stopped',reason,fixed);
   const config=deps.configuration(proof.provider,proof.model);
   if(!config || config.model!==proof.model || createHash('sha256').update(config.apiKey).digest('hex')!==proof.credentialSha256)
    return stop('stopped','configuration',fixed);
   if(!ready())return stop('stopped',reason,fixed);
   const dispatchedAt=Date.now();
   if(dispatchedAt>=end || boundedSignal.aborted)return stop('stopped','deadline',fixed);
   failure='provider-unknown';
   const result=await bounded(deps.dispatch(proof.provider,config,fixed.message,{prompt:fixed.prompt,language:fixed.language,
    classifier:false,maxOutputTokens:permit.outputTokenCeiling,timeoutMs:Math.max(1,end-Date.now()),signal:boundedSignal,
    standardBilling:true,pilotMeasurement:true}),boundedSignal);
   failure='runtime';
   if(!result)return stop('stopped','provider-unknown',fixed);
   const schemaValid='guidanceOptions' in fixed
    ? composePlatformDialogue(result.answer,fixed.units,fixed.language,fixed.guidanceOptions)!==null
    : composePublicAgentDialogue(result.answer,fixed.units,fixed.language)!==null;
   observations.push(Object.freeze({caseId:fixed.caseId,requestId:approved.requestId,attemptId,stage:fixed.stage,language:fixed.language,
    model:result.model===proof.model?result.model:null,completedAtMs:Date.now(),latencyMs:Math.max(0,Date.now()-dispatchedAt),
    inputTokens:integer(result.inputTokens)?result.inputTokens:null,outputTokens:integer(result.outputTokens)?result.outputTokens:null,
    reservedCostMicros:cost,transportOk:result.ok,schemaValid,answer:schemaValid?result.answer.slice(0,4096):''}));
   if(!ready())return stop('stopped',reason,fixed);
   if(!result.ok)return stop('stopped','provider-unknown',fixed);
   if(!schemaValid || result.model!==proof.model || result.citations.length!==0 || !integer(result.inputTokens) || result.inputTokens>permit.inputTokenCeiling
    || !integer(result.outputTokens) || result.outputTokens>permit.outputTokenCeiling)return stop('stopped','provider-output',fixed);
   if(!await current() || !ready())return stop('stopped',reason,fixed);
  }catch{return stop('stopped',failure,fixed);}finally{controller.abort();}
 }
 return Object.freeze({kind:'candidate',qualified:false,semanticReview:'required',observations:Object.freeze(observations)});
}
