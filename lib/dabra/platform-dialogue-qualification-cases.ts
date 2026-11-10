import { PLATFORM_DIALOGUE_CASES } from './platform-dialogue-cases';
import { PLATFORM_DIALOGUE_PROMPT, platformDialoguePayload } from './agent-platform-dialogue';

// These are the existing canonical public SYNTHETIC cases, not customer data.
// Reuse the actual runtime projection, prompt and closed guidance options.
export const PLATFORM_DIALOGUE_QUALIFICATION_CASES = Object.freeze(PLATFORM_DIALOGUE_CASES.map(item => {
 const trip = item.trip ? { ...item.trip, id: '00000000-0000-4000-8000-000000000001', families: [...item.trip.families] } : null;
 const payload = platformDialoguePayload(item.language, item.question, item.units, trip);
 if (!payload) throw new Error('invalid_fixed_dialogue_qualification_case');
 return Object.freeze({ caseId: item.caseId, stage: 'discover' as const, language: item.language,
  prompt: PLATFORM_DIALOGUE_PROMPT, message: JSON.stringify(payload),
  units: Object.freeze([...item.units]), guidanceOptions: Object.freeze([...payload.guidanceOptions]),
 });
}));
