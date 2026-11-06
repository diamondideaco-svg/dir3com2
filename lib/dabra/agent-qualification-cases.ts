import { createHash } from 'node:crypto';
import { AGENT_DIALOGUE_PROMPT } from './agent-platform-units';

// Canonical public SYNTHETIC inputs for future qualification, never runtime facts.
const entries = [
 { caseId: 'platform-ar-initial', language: 'ar', units: ['حالة اختبار اصطناعية: خمسة أشخاص، مدينة الاختبار، ثلاثة أيام.', 'السعر والتوفر غير معروفين.', 'ما تاريخا البداية والنهاية؟'] },
 { caseId: 'platform-en-initial', language: 'en', units: ['SYNTHETIC case: five people, Example City, three days.', 'Price and availability are unknown.', 'What are the start and end dates?'] },
 { caseId: 'platform-ar-followup', language: 'ar', units: ['متابعة اختبار اصطناعية: العدد خمسة والمدة ثلاثة أيام.', 'حُددت تواريخ الاختبار ولم يُؤكد حجز أو دفع.', 'هل تفضل سائقًا أم قيادة ذاتية؟'] },
 { caseId: 'platform-en-followup', language: 'en', units: ['SYNTHETIC follow-up: five people and three days.', 'The test dates are specified; no booking or payment is confirmed.', 'Would you prefer a driver or self-drive?'] },
] as const;
export const PLATFORM_UNITS_QUALIFICATION_CASES = Object.freeze(entries.map(item => Object.freeze({
 caseId: item.caseId, stage: 'discover' as const, language: item.language, prompt: AGENT_DIALOGUE_PROMPT,
 message: JSON.stringify({ language: item.language, units: item.units }), units: Object.freeze([...item.units]),
})));
export const PLATFORM_UNITS_CASE_SET_SHA256 = createHash('sha256').update(JSON.stringify(PLATFORM_UNITS_QUALIFICATION_CASES)).digest('hex');
export const qualificationInputSha256 = (value: { prompt: string; message: string }) =>
 createHash('sha256').update(JSON.stringify([value.prompt, value.message])).digest('hex');
