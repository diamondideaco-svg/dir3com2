import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { classifierPrompt } from './agent-planner';
import { parseAgentTool } from './agent-contract';
import { generalTravelContext, GENERAL_TRAVEL_PROMPT, parseGeneralTravelAdvice } from './agent-general-travel';
import { dialogueDay, type DialogueDailyLimits } from './agent-dialogue';
import { fundingSubject, fundingProofForCeilings, validTask217PilotEnvelope, quoteDialogueFunding, validFundingDailyLimits,
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
  subject: string; proof: DialogueFundingProof; permit: FirstProfilePermit; daily: DialogueDailyLimits; maxCostMicros: number;
}>;
export type MeasurementObservation = Readonly<{
  caseId: FixedCase['caseId']; requestId: string; attemptId: string; stage: FixedCase['stage']; language: FixedCase['language'];
  model: string | null; completedAtMs: number; latencyMs: number; inputTokens: number | null; outputTokens: number | null;
  reservedCostMicros: number; transportOk: boolean; schemaValid: boolean; answer: string;
}>;
export type FirstProfileMeasurementResult = Readonly<{
  kind: 'blocked' | 'stopped' | 'candidate'; qualified: false; semanticReview: 'required';
  observations: readonly MeasurementObservation[];
}>;
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
  const finish = (kind: FirstProfileMeasurementResult['kind']): FirstProfileMeasurementResult =>
    Object.freeze({ kind, qualified: false, semanticReview: 'required', observations: Object.freeze(observations) });
  const permit = parseFirstProfilePermit(plan.proof.measurementPermit);
  if (!permit || JSON.stringify(permit) !== JSON.stringify(plan.permit)
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(plan.subject) || fundingSubject(plan.subject) !== permit.subjectHash
    || !integer(plan.maxCostMicros) || !validFundingDailyLimits(plan.daily, 4096, 1024)) return finish('blocked');
  const pilot = validTask217PilotEnvelope(plan.proof.pilotEnvelope);
  const configuration = () => dependencies.configuration(plan.proof.provider, pilot ? plan.proof.model : undefined);
  const ceilings = { provider: plan.proof.provider, model: plan.proof.model, environment: plan.proof.environment,
    inputTokenCeiling: permit.inputTokenCeiling, outputTokenCeiling: permit.outputTokenCeiling };
  for (const fixed of FIRST_PROFILE_CASES) {
    const approvedCase = permit.cases.find(c => c.caseId === fixed.caseId);
    if (!approvedCase || signal?.aborted) return finish('stopped');
    const start = Date.now();
    const end = Math.min(start + 12000, permit.expiresAtMs, plan.proof.expiresAtMs, plan.proof.quotaWindowEndMs, dialogueDay(start).dayEndMs);
    if (end <= start || Buffer.byteLength(fixed.prompt + fixed.message, 'utf8') + 128 > permit.inputTokenCeiling) return finish('blocked');
    const controller = new AbortController();
    const stopSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(end - start), ...(signal ? [signal] : [])]);
    const ready = () => {
      if (stopSignal.aborted) return false;
      const config = configuration();
      if (!config || config.model !== plan.proof.model
        || createHash('sha256').update(config.apiKey).digest('hex') !== plan.proof.credentialSha256
        || dependencies.sourceSha() !== permit.sourceSha) return false;
      // Git/config verification is synchronous but may block. Read time AFTER it, not before it.
      const now = Date.now(), cost = quoteDialogueFunding(plan.proof, ceilings, now);
      return !stopSignal.aborted && now < end && now < permit.expiresAtMs && permit.expiresAtMs <= plan.proof.expiresAtMs
        && fundingProofForCeilings(plan.proof, ceilings, now) && cost !== null && cost <= plan.maxCostMicros;
    };
    const current = async () => ready() && await bounded(dependencies.authorityCurrent(stopSignal), stopSignal) === true && ready();
    try {
      if (!await current() || !ready()) return finish('blocked');
      const cost = quoteDialogueFunding(plan.proof, ceilings, Date.now());
      if (cost === null || !ready()) return finish('blocked');
      const attemptId = randomUUID();
      const claim = await bounded(dependencies.admission.reserve({
        policyId: 'task217-existing-credit-v2', attemptId, requestId: approvedCase.requestId, stage: fixed.stage, subject: plan.subject,
        nowMs: Date.now(), ...dialogueDay(Date.now()), proof: plan.proof, inputTokens: permit.inputTokenCeiling,
        outputTokens: permit.outputTokenCeiling, costMicros: cost, limits: plan.daily,
        measurementRequest: { planId: permit.planId, caseId: fixed.caseId },
      }, stopSignal), stopSignal);
      if (!ready() || claim?.kind !== 'admitted' || claim.attemptId !== attemptId || !await current() || !ready()) return finish('stopped');
      const config = configuration();
      if (!config || config.model !== plan.proof.model
        || createHash('sha256').update(config.apiKey).digest('hex') !== plan.proof.credentialSha256 || !ready()) return finish('stopped');
      const dispatchedAt = Date.now();
      const result = await bounded(dependencies.dispatch(plan.proof.provider, config, fixed.message, {
        prompt: fixed.prompt, language: fixed.language, classifier: fixed.stage === 'intent.classify',
        maxOutputTokens: permit.outputTokenCeiling, timeoutMs: Math.max(1, end - Date.now()),
        signal: stopSignal, standardBilling: plan.proof.mode === 'existing-credit', pilotMeasurement: pilot,
      }), stopSignal);
      if (!result) return finish('stopped');
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
      if (!ready() || !result.ok || !schemaValid || result.model !== config.model || result.citations.length !== 0
        || !integer(result.inputTokens) || result.inputTokens > permit.inputTokenCeiling
        || !integer(result.outputTokens) || result.outputTokens > permit.outputTokenCeiling
        || !await current() || !ready()) return finish('stopped');
    } catch { return finish('stopped'); }
    finally { controller.abort(); }
  }
  return finish('candidate');
}
