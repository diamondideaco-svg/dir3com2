import 'server-only';
import { createHash } from 'node:crypto';
import type { AgentCapabilityProfile } from './agent-capabilities';
import { durableProfileSha256 } from './dialogue-durable-authority';
import { GENERAL_TRAVEL_PROMPT } from './agent-general-travel';
import { PLATFORM_DIALOGUE_PROMPT, PLATFORM_DIALOGUE_GUIDANCE_IDS } from './agent-platform-dialogue';
import { PLATFORM_DIALOGUE_CASE_SET_SHA256 } from './platform-dialogue-cases';
import { AGENT_DIALOGUE_PROMPT } from './agent-platform-units';
import { PLATFORM_UNITS_CASE_SET_SHA256 } from './agent-qualification-cases';

export type AgentOutputContractId = 'intent-tool-v1' | 'general-travel-v1' | 'platform-units-v1' | 'platform-dialogue-v2';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export const LEGACY_FIRST_PROFILE_CASE_SET_SHA256 = '65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056';
export const CLASSIFIER_PROMPT_SHA256 = 'a948945b3f927f6408fd501ed6edc50dc4d6f918a81d81cfbb2e554b0cb749e8';
// Guarded against the actual parser sources by delta tests. Changes need a new
// canonical contract and genuine semantic acceptance, never an alias of old data.
export const OUTPUT_PARSER_SHA256S = {"platform-dialogue-v2":"856a54b6e5b9a21db253f1f706a749455f4edcbc3afbe635e22237130de31745","intent-tool-v1":"12e6db3443ea2896414844de135c068562ea7a43d50a93719e80679b7a70448b","general-travel-v1":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","platform-units-v1":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87"} as const;
export function canonicalOutputContract(id: AgentOutputContractId, language: 'ar' | 'en') {
 const capability = id === 'intent-tool-v1' ? 'intent.classify' : 'discover';
 const caseSetSha = id === 'platform-dialogue-v2' ? PLATFORM_DIALOGUE_CASE_SET_SHA256 : id === 'platform-units-v1' ? PLATFORM_UNITS_CASE_SET_SHA256 : LEGACY_FIRST_PROFILE_CASE_SET_SHA256;
 const promptSha256 = id === 'platform-dialogue-v2' ? sha(PLATFORM_DIALOGUE_PROMPT) : id === 'intent-tool-v1' ? CLASSIFIER_PROMPT_SHA256 : sha(id === 'general-travel-v1' ? GENERAL_TRAVEL_PROMPT : AGENT_DIALOGUE_PROMPT);
 const inputVersion = id === 'platform-dialogue-v2' ? 'bounded-question-trip-guidance-options-v4' : id === 'intent-tool-v1' ? 'redacted-user-text-v1' : id === 'general-travel-v1' ? 'bounded-general-context-v2' : 'server-language-numbered-units-v2';
 const outputVersion = id === 'platform-dialogue-v2' ? 'closed-guidance-with-general-tips-v4' : id === 'intent-tool-v1' ? 'single-known-tool-v1' : id === 'general-travel-v1' ? 'general-travel-advice-v1' : 'opening-adjacent-complete-indices-v1';
 const parserSha256 = OUTPUT_PARSER_SHA256S[id];
 const cases = id === 'platform-dialogue-v2' ? 4 : id === 'platform-units-v1' ? 2 : 1;
 const digest = hash(['task217-canonical-output-contract-v1',id,capability,language,caseSetSha,promptSha256,inputVersion,outputVersion,parserSha256,cases]);
 return Object.freeze({ id, capability, language, caseSetSha, promptSha256, inputVersion, outputVersion, parserSha256, cases, digest });
}
export type ProfileOutputAcceptance = Readonly<{
 schema: 'task217-profile-output-acceptance-v1'; profileSha256: string; contractSha256: string;
 sourceSha: string; provider: AgentCapabilityProfile['provider']; model: string;
 environment: AgentCapabilityProfile['measurement']['environment']; capability: 'discover' | 'intent.classify';
 language: 'ar' | 'en'; caseSetSha: string; reviewedAtMs: number;
 receipt: Readonly<{ implementationSession: string; reviewerSession: string; reference: string; artifactSha256: string; verdict: 'PASS'; authorship: 'none' }>;
}>;
// No model has yet received genuine independent acceptance for the new recipe.
// Defining canonical inputs or injecting synthetic test receipts does not qualify it.
export const APPROVED_PROFILE_OUTPUT_ACCEPTANCES: readonly ProfileOutputAcceptance[] = Object.freeze([]);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

/** Contract comes from the server's actual prompt and payload, not a client tag. */
export function requestOutputContract(capability: 'discover' | 'intent.classify', language: 'ar' | 'en', prompt: string, message: string) {
 const promptDigest = sha(prompt);
 if (capability === 'intent.classify') return promptDigest === CLASSIFIER_PROMPT_SHA256 ? canonicalOutputContract('intent-tool-v1',language) : null;
 const id = promptDigest === sha(PLATFORM_DIALOGUE_PROMPT) ? 'platform-dialogue-v2' : promptDigest === sha(AGENT_DIALOGUE_PROMPT) ? 'platform-units-v1' : promptDigest === sha(GENERAL_TRAVEL_PROMPT) ? 'general-travel-v1' : null;
 if (!id) return null;
 try {
  const payload: unknown = JSON.parse(message);
  if (!object(payload) || payload.language !== language) return null;
   // Only the exact server-generated notice is accepted, outside bounded user text.
   const hasAttachmentNote = Object.hasOwn(payload,'serverAttachmentNote');
   if (hasAttachmentNote && ![1,2,3].some(count => payload.serverAttachmentNote === (language === 'ar'
    ? `[أرفق المستخدم ${count} ملفًا تحقق الخادم من سلامة نوعه. محتوى الملفات غير مُرسل إلى مزود الذكاء الاصطناعي، فلا تدّعِ قراءته.]`
    : `[The user attached ${count} server-validated file(s). Their contents are not sent to the AI provider, so do not claim to have read them.]`))) return null;
   const payloadKeys = (keys: string[]) => hasAttachmentNote ? [...keys,'serverAttachmentNote'] : keys;
  if (id === 'platform-dialogue-v2') {
    if (!exact(payload,payloadKeys(['language','question','trip','units','guidanceOptions'])) || typeof payload.question!=='string' || payload.question.length>500
    || !Array.isArray(payload.guidanceOptions) || payload.guidanceOptions.length<1 || payload.guidanceOptions.length>PLATFORM_DIALOGUE_GUIDANCE_IDS.length
    || new Set(payload.guidanceOptions).size!==payload.guidanceOptions.length || payload.guidanceOptions.some(v=>typeof v!=='string'||!PLATFORM_DIALOGUE_GUIDANCE_IDS.some(id=>id===v))
    || !Array.isArray(payload.units) || payload.units.length<1 || payload.units.length>32 || payload.units.some(v=>typeof v!=='string'||v.length<1||v.length>4000)
    || (payload.trip!==null && (!object(payload.trip)||!exact(payload.trip,['origin','destination','startDate','endDate','adults','children','rooms','budget','currency','families'])))) return null;
  } else if (id === 'platform-units-v1') {
    if (!exact(payload,payloadKeys(['language','units'])) || !Array.isArray(payload.units) || payload.units.length < 1 || payload.units.length > 32
    || payload.units.some(v => typeof v !== 'string' || v.length === 0 || v.length > 4000)) return null;
   } else if (!exact(payload,payloadKeys(['language','general'])) || !object(payload.general)) return null;
  return canonicalOutputContract(id,language);
 } catch { return null; }
}
/** Full original profile + canonical parser/input/output + independent receipt.
 * Extra output tags on a 15-field measurement hash confer no permission. */
export function profileOutputAccepted(profile: AgentCapabilityProfile, contract: ReturnType<typeof canonicalOutputContract>,
 acceptances: readonly unknown[], now: number) {
 const m = profile.measurement;
 if (m.capability !== contract.capability || m.language !== contract.language || m.caseSetSha !== contract.caseSetSha
  || m.cases !== contract.cases || m.passed !== m.cases) return false;
 const matches = acceptances.filter((value: unknown) => {
  if (!object(value) || !exact(value,['schema','profileSha256','contractSha256','sourceSha','provider','model','environment','capability','language','caseSetSha','reviewedAtMs','receipt'])
   || value.schema !== 'task217-profile-output-acceptance-v1' || value.profileSha256 !== durableProfileSha256(profile)
   || value.contractSha256 !== contract.digest || value.sourceSha !== m.sourceSha || value.provider !== profile.provider || value.model !== m.model
   || value.environment !== m.environment || value.capability !== m.capability || value.language !== m.language || value.caseSetSha !== m.caseSetSha
   || typeof value.reviewedAtMs !== 'number' || !Number.isSafeInteger(value.reviewedAtMs) || value.reviewedAtMs < m.measuredAtMs || value.reviewedAtMs > now) return false;
  const r = value.receipt;
  return object(r) && exact(r,['implementationSession','reviewerSession','reference','artifactSha256','verdict','authorship'])
   && uuid(r.implementationSession) && uuid(r.reviewerSession) && r.implementationSession.toLowerCase() !== r.reviewerSession.toLowerCase()
   && r.verdict === 'PASS' && r.authorship === 'none' && typeof r.reference === 'string'
   && /^https:\/\/github\.com\/diamondideaco-svg\/dir3com2\/issues\/217#issuecomment-[1-9][0-9]*$/.test(r.reference)
   && typeof r.artifactSha256 === 'string' && /^[a-f0-9]{64}$/.test(r.artifactSha256);
 });
 return matches.length === 1;
}
